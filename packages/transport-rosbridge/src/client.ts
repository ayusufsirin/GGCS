import ROSLIB from "roslib";

export type RosbridgeClientEvent = "connection" | "close" | "error";
export type RosbridgeClientListener = (value?: unknown) => void;

export interface RosbridgeTopicOptions {
  readonly topic: string;
  readonly messageType: string;
  readonly compression?: string;
  readonly throttleRateMs?: number;
  readonly queueLength?: number;
}

export type RosbridgeTopicListener = (message: unknown) => void;

export interface RosbridgeTopic {
  subscribe(listener: RosbridgeTopicListener): void;
  unsubscribe(listener: RosbridgeTopicListener): void;
}

/**
 * Narrow seam around the ROSLIB session used by the transport provider.
 * Tests inject this interface so connection/reconnect/topic behavior never
 * needs real sleeps or external networking.
 */
export interface RosbridgeClient {
  readonly isConnected: boolean;
  on(event: RosbridgeClientEvent, listener: RosbridgeClientListener): void;
  connect(url: string): void;
  close(): void;
  createTopic(options: RosbridgeTopicOptions): RosbridgeTopic;
}

export interface RosbridgeClientFactory {
  create(): RosbridgeClient;
}

class RoslibTopic implements RosbridgeTopic {
  private readonly topic: ROSLIB.Topic;

  constructor(ros: ROSLIB.Ros, options: RosbridgeTopicOptions) {
    const topicOptions = {
      ros,
      name: options.topic,
      messageType: options.messageType,
      // GGCS owns rebinding across connection generations. Disable ROSLIB's
      // independent resubscribe path so one physical subscription cannot be
      // duplicated by two reconnect managers. ROSLIB 1.4.1 supports this
      // runtime option even though older DefinitelyTyped declarations may not.
      reconnect_on_close: false,
      ...(options.compression !== undefined
        ? { compression: options.compression }
        : {}),
      ...(options.throttleRateMs !== undefined
        ? { throttle_rate: options.throttleRateMs }
        : {}),
      ...(options.queueLength !== undefined
        ? { queue_length: options.queueLength }
        : {}),
    };
    this.topic = new ROSLIB.Topic(
      topicOptions as ConstructorParameters<typeof ROSLIB.Topic>[0],
    );

    // ROSLIB 1.4.1 has a binding defect when reconnect_on_close=false:
    // Topic assigns ros.callOnConnection as an unbound function and later
    // invokes it with the Topic as `this`, so subscribe/advertise throws
    // before any rosbridge frame is sent. GGCS deliberately disables
    // ROSLIB reconnect because the Connection owns session rebinding, so
    // rebind only this send hook to the actual Ros instance. Keep the
    // workaround isolated to the ROSLIB adapter edge.
    const topicInternals = this.topic as unknown as {
      callForSubscribeAndAdvertise(message: unknown): void;
    };
    const rosInternals = ros as unknown as {
      callOnConnection(message: unknown): void;
    };
    topicInternals.callForSubscribeAndAdvertise = (message: unknown): void => {
      rosInternals.callOnConnection(message);
    };
  }

  subscribe(listener: RosbridgeTopicListener): void {
    this.topic.subscribe(listener);
  }

  unsubscribe(listener: RosbridgeTopicListener): void {
    this.topic.unsubscribe(listener);
  }
}

class RoslibClient implements RosbridgeClient {
  private readonly ros = new ROSLIB.Ros({});

  get isConnected(): boolean {
    return this.ros.isConnected;
  }

  on(event: RosbridgeClientEvent, listener: RosbridgeClientListener): void {
    this.ros.on(event, listener);
  }

  connect(url: string): void {
    this.ros.connect(url);
  }

  close(): void {
    this.ros.close();
  }

  createTopic(options: RosbridgeTopicOptions): RosbridgeTopic {
    return new RoslibTopic(this.ros, options);
  }
}

export const defaultRosbridgeClientFactory: RosbridgeClientFactory = {
  create(): RosbridgeClient {
    return new RoslibClient();
  },
};
