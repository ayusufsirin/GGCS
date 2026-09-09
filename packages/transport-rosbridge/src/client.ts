import ROSLIB from "roslib";

export type RosbridgeClientEvent = "connection" | "close" | "error";
export type RosbridgeClientListener = (value?: unknown) => void;

export interface RosbridgeTopicOptions {
  readonly topic: string;
  readonly messageType: string;
  readonly compression?: string;
  readonly throttleRateMs?: number;
  readonly queueLength?: number;
  readonly queueSize?: number;
  readonly latch?: boolean;
}

export type RosbridgeTopicListener = (message: unknown) => void;

export interface RosbridgeServiceOptions {
  readonly service: string;
  readonly serviceType: string;
}

export interface RosbridgeService {
  call(
    request: unknown,
    onSuccess: (response: unknown) => void,
    onError: (error: unknown) => void,
  ): void;
}

export interface RosbridgeTopic {
  subscribe(listener: RosbridgeTopicListener): void;
  unsubscribe(listener: RosbridgeTopicListener): void;
  advertise(): void;
  unadvertise(): void;
  publish(message: unknown): void;
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
  createService(options: RosbridgeServiceOptions): RosbridgeService;
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
      ...(options.queueSize !== undefined ? { queue_size: options.queueSize } : {}),
      ...(options.latch !== undefined ? { latch: options.latch } : {}),
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

  advertise(): void {
    this.topic.advertise();
  }

  unadvertise(): void {
    this.topic.unadvertise();
  }

  publish(message: unknown): void {
    this.topic.publish(
      new ROSLIB.Message(message as ConstructorParameters<typeof ROSLIB.Message>[0]),
    );
  }
}

class RoslibService implements RosbridgeService {
  private readonly service: ROSLIB.Service;

  constructor(ros: ROSLIB.Ros, options: RosbridgeServiceOptions) {
    this.service = new ROSLIB.Service({
      ros,
      name: options.service,
      serviceType: options.serviceType,
    });
  }

  call(
    request: unknown,
    onSuccess: (response: unknown) => void,
    onError: (error: unknown) => void,
  ): void {
    this.service.callService(
      new ROSLIB.ServiceRequest(
        request as ConstructorParameters<typeof ROSLIB.ServiceRequest>[0],
      ),
      onSuccess,
      onError as (error: string) => void,
    );
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

  createService(options: RosbridgeServiceOptions): RosbridgeService {
    return new RoslibService(this.ros, options);
  }
}

export const defaultRosbridgeClientFactory: RosbridgeClientFactory = {
  create(): RosbridgeClient {
    return new RoslibClient();
  },
};
