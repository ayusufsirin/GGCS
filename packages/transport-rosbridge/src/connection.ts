import {
  RuntimeError,
  createSubscription,
  type Connection,
  type ConnectionState,
  type RuntimeClock,
  type ScheduledTask,
  type Subscription,
} from "@ggcs/core";
import type { ConnectionId } from "@ggcs/schema";
import type {
  RosbridgeClient,
  RosbridgeClientFactory,
  RosbridgeTopic,
  RosbridgeTopicListener,
  RosbridgeTopicOptions,
} from "./client.js";

export interface RosbridgeReconnectPolicy {
  readonly enabled: boolean;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
}

export interface RosbridgeConnectionOptions {
  readonly id: ConnectionId;
  readonly url: string;
  readonly reconnect: RosbridgeReconnectPolicy;
  readonly clock: RuntimeClock;
  readonly clientFactory: RosbridgeClientFactory;
}

interface TopicConsumer {
  readonly onMessage: RosbridgeTopicListener;
  readonly onError: (error: RuntimeError) => void;
}

interface TopicPoolEntry {
  readonly options: RosbridgeTopicOptions;
  readonly consumers: Set<TopicConsumer>;
  topic: RosbridgeTopic | undefined;
  physicalListener: RosbridgeTopicListener | undefined;
}

function asConnectionError(error: unknown, url: string): RuntimeError {
  if (error instanceof RuntimeError) return error;
  return new RuntimeError({
    code: "GGCS_ROSBRIDGE_CONNECTION_FAILURE",
    category: "resource_error",
    message: `ROSBridge connection failure for ${url}`,
    details: { url },
    cause: error,
  });
}

function asTopicSubscriptionError(
  error: unknown,
  options: RosbridgeTopicOptions,
): RuntimeError {
  if (error instanceof RuntimeError) return error;
  return new RuntimeError({
    code: "GGCS_ROSBRIDGE_TOPIC_SUBSCRIBE_FAILURE",
    category: "resource_error",
    message: `ROSBridge topic subscription failed for ${options.topic}`,
    details: {
      topic: options.topic,
      messageType: options.messageType,
    },
    cause: error,
  });
}

function notifySafely(
  listeners: ReadonlySet<(state: ConnectionState) => void>,
  state: ConnectionState,
): void {
  for (const listener of [...listeners]) {
    try {
      listener(state);
    } catch {
      // Connection observers are isolated from provider lifecycle.
    }
  }
}

function topicPoolKey(options: RosbridgeTopicOptions): string {
  return JSON.stringify([
    options.topic,
    options.messageType,
    options.compression ?? null,
    options.throttleRateMs ?? null,
    options.queueLength ?? null,
  ]);
}

export class RosbridgeConnection implements Connection {
  readonly kind = "connection" as const;
  readonly id: ConnectionId;

  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private readonly client: RosbridgeClient;
  private readonly topicPool = new Map<string, TopicPoolEntry>();
  private stateValue: ConnectionState;
  private reconnectTask: ScheduledTask | undefined;
  private disposed = false;
  private started = false;
  private reconnectAttempt = 0;
  private sessionGeneration = 0;
  private lastFailure: RuntimeError | undefined;

  constructor(private readonly options: RosbridgeConnectionOptions) {
    this.id = options.id;
    this.stateValue = {
      state: "disconnected",
      since: options.clock.wallNow(),
    };
    this.client = options.clientFactory.create();
    this.client.on("connection", () => this.handleConnection());
    this.client.on("error", (error) => this.handleError(error));
    this.client.on("close", () => this.handleClose());
  }

  current(): ConnectionState {
    return this.stateValue;
  }

  subscribe(listener: (state: ConnectionState) => void): Subscription {
    if (!this.disposed) this.listeners.add(listener);
    try {
      listener(this.stateValue);
    } catch {
      // Same isolation guarantee as normal updates.
    }
    return createSubscription(() => this.listeners.delete(listener));
  }

  /** Provider lifecycle hook. Not exposed through generic Connection. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.beginConnect();
  }

  /** Provider lifecycle hook. Runtime owns this through LiveResource.dispose(). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reconnectTask?.cancel();
    this.reconnectTask = undefined;
    this.unbindAllTopics();
    this.topicPool.clear();
    try {
      this.client.close();
    } catch {
      // Runtime disposal must still complete if ROSLIB close itself throws.
    }
    this.transition({
      state: "disconnected",
      since: this.options.clock.wallNow(),
      ...(this.lastFailure !== undefined ? { reason: this.lastFailure } : {}),
    });
    this.listeners.clear();
  }

  /** Package-internal session generation for topic/service rebinding. */
  generation(): number {
    return this.sessionGeneration;
  }

  /** Package-internal ROS client for later transport providers. */
  rosClient(): RosbridgeClient {
    return this.client;
  }

  /**
   * Acquire a semantic consumer of a physical ROS subscription. Equivalent
   * wire-significant options share one ROSLIB.Topic within this Connection.
   */
  acquireTopicSubscription(
    options: RosbridgeTopicOptions,
    consumer: TopicConsumer,
  ): Subscription {
    if (this.disposed) {
      consumer.onError(
        new RuntimeError({
          code: "GGCS_ROSBRIDGE_CONNECTION_DISPOSED",
          category: "resource_unavailable",
          message: `ROSBridge connection ${this.id} is disposed`,
          details: { connection: this.id, topic: options.topic },
        }),
      );
      return createSubscription(() => undefined);
    }

    const key = topicPoolKey(options);
    let entry = this.topicPool.get(key);
    if (!entry) {
      entry = {
        options,
        consumers: new Set(),
        topic: undefined,
        physicalListener: undefined,
      };
      this.topicPool.set(key, entry);
    }
    entry.consumers.add(consumer);

    if (this.stateValue.state === "connected") {
      this.bindTopic(entry);
    }

    return createSubscription(() => {
      const current = this.topicPool.get(key);
      if (!current) return;
      current.consumers.delete(consumer);
      if (current.consumers.size > 0) return;
      this.unbindTopic(current);
      this.topicPool.delete(key);
    });
  }

  private transition(next: ConnectionState): void {
    this.stateValue = next;
    notifySafely(this.listeners, next);
  }

  private beginConnect(): void {
    if (this.disposed) return;
    this.reconnectTask?.cancel();
    this.reconnectTask = undefined;
    this.transition({ state: "connecting", since: this.options.clock.wallNow() });
    try {
      this.client.connect(this.options.url);
    } catch (error) {
      this.lastFailure = asConnectionError(error, this.options.url);
      this.scheduleReconnectOrDisconnect();
    }
  }

  private handleConnection(): void {
    if (this.disposed) return;
    this.reconnectTask?.cancel();
    this.reconnectTask = undefined;
    this.reconnectAttempt = 0;
    this.lastFailure = undefined;
    this.sessionGeneration += 1;
    this.transition({ state: "connected", since: this.options.clock.wallNow() });
    this.bindAllTopics();
  }

  private handleError(error: unknown): void {
    if (this.disposed) return;
    this.lastFailure = asConnectionError(error, this.options.url);
    // If reconnect is already scheduled, keep the observable state as
    // reconnecting. A late ROSLIB error event must not hide an active loop.
    if (this.reconnectTask !== undefined || this.stateValue.state === "reconnecting") return;
    this.transition({
      state: "degraded",
      since: this.options.clock.wallNow(),
      reason: this.lastFailure,
    });
    // ROSLIB normally emits close after a socket error. Reconnect scheduling is
    // driven by close so error+close cannot create duplicate reconnect loops.
  }

  private handleClose(): void {
    if (this.disposed) return;
    // Physical ROSLIB Topic objects belong to one live session generation.
    // Remove them before reconnect so no resource can keep using a dead object.
    this.unbindAllTopics();
    this.scheduleReconnectOrDisconnect();
  }

  private scheduleReconnectOrDisconnect(): void {
    if (this.disposed) return;
    if (!this.options.reconnect.enabled) {
      this.transition({
        state: "disconnected",
        since: this.options.clock.wallNow(),
        ...(this.lastFailure !== undefined ? { reason: this.lastFailure } : {}),
      });
      return;
    }
    if (this.reconnectTask !== undefined) return;

    this.reconnectAttempt += 1;
    const attempt = this.reconnectAttempt;
    const exponential =
      this.options.reconnect.initialDelayMs *
      this.options.reconnect.multiplier ** Math.max(0, attempt - 1);
    const delayMs = Math.min(this.options.reconnect.maxDelayMs, exponential);

    this.transition({
      state: "reconnecting",
      since: this.options.clock.wallNow(),
      attempt,
    });
    this.reconnectTask = this.options.clock.schedule(delayMs, () => {
      this.reconnectTask = undefined;
      this.beginConnect();
    });
  }

  private bindAllTopics(): void {
    for (const entry of this.topicPool.values()) this.bindTopic(entry);
  }

  private bindTopic(entry: TopicPoolEntry): void {
    if (
      this.disposed ||
      this.stateValue.state !== "connected" ||
      entry.topic !== undefined ||
      entry.consumers.size === 0
    ) {
      return;
    }

    try {
      const topic = this.client.createTopic(entry.options);
      const listener: RosbridgeTopicListener = (message) => {
        for (const consumer of [...entry.consumers]) {
          try {
            consumer.onMessage(message);
          } catch {
            // One semantic Source consumer must not break pooled delivery.
          }
        }
      };
      topic.subscribe(listener);
      entry.topic = topic;
      entry.physicalListener = listener;
    } catch (error) {
      const mapped = asTopicSubscriptionError(error, entry.options);
      for (const consumer of [...entry.consumers]) {
        try {
          consumer.onError(mapped);
        } catch {
          // Error observers are isolated from the transport pool.
        }
      }
    }
  }

  private unbindAllTopics(): void {
    for (const entry of this.topicPool.values()) this.unbindTopic(entry);
  }

  private unbindTopic(entry: TopicPoolEntry): void {
    const topic = entry.topic;
    const listener = entry.physicalListener;
    entry.topic = undefined;
    entry.physicalListener = undefined;
    if (!topic || !listener) return;
    try {
      topic.unsubscribe(listener);
    } catch {
      // Socket/session disposal must continue even if ROSLIB unsubscribe fails.
    }
  }
}
