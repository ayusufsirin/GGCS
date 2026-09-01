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
import type { RosbridgeClient, RosbridgeClientFactory } from "./client.js";

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

export class RosbridgeConnection implements Connection {
  readonly kind = "connection" as const;
  readonly id: ConnectionId;

  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private readonly client: RosbridgeClient;
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

  /** Package-internal session generation for later topic/service rebinding. */
  generation(): number {
    return this.sessionGeneration;
  }

  /** Package-internal ROS client for later transport providers. */
  rosClient(): RosbridgeClient {
    return this.client;
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
}
