import ROSLIB from "roslib";
import { LIVE_RESOURCE_IDS, LIVE_TOPIC_NAMES } from "./definition.js";

type SemanticResourceId =
  | typeof LIVE_RESOURCE_IDS.speed
  | typeof LIVE_RESOURCE_IDS.acceleration
  | typeof LIVE_RESOURCE_IDS.satellites;

export type LegacyConnectionState = "disconnected" | "connecting" | "connected";

export interface LegacyReferenceOptions {
  readonly url: string;
  readonly reconnectDelayMs?: number;
  onSample(resourceId: SemanticResourceId, value: number): void;
  onConnectionState?(state: LegacyConnectionState): void;
}

function numericData(message: unknown, topic: string): number {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    throw new Error(`Legacy reference ${topic} delivered a non-object message`);
  }
  const data = (message as Readonly<Record<string, unknown>>).data;
  if (typeof data !== "number" || !Number.isFinite(data)) {
    throw new Error(`Legacy reference ${topic} data must be a finite number`);
  }
  return data;
}

export class LegacyReferenceObserver {
  private readonly ros = new ROSLIB.Ros({});
  private readonly reconnectDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private connected = false;
  private readonly topics: ROSLIB.Topic[];

  constructor(private readonly options: LegacyReferenceOptions) {
    this.reconnectDelayMs = options.reconnectDelayMs ?? 250;
    this.topics = [
      this.topic(
        LIVE_TOPIC_NAMES.speed,
        "std_msgs/msg/Float64",
        "vehicle.speed",
      ),
      this.topic(
        LIVE_TOPIC_NAMES.acceleration,
        "std_msgs/msg/Float64",
        "vehicle.acceleration",
      ),
      this.topic(
        LIVE_TOPIC_NAMES.satellites,
        "std_msgs/msg/Int64",
        "arnav.satellites",
      ),
    ];

    this.ros.on("connection", () => {
      this.connected = true;
      this.options.onConnectionState?.("connected");
    });
    this.ros.on("close", () => {
      this.connected = false;
      this.options.onConnectionState?.("disconnected");
      this.scheduleReconnect();
    });
    this.ros.on("error", () => {
      // ROSLIB normally follows an error with close. The close event owns the
      // reconnect schedule so error+close cannot create duplicate loops.
    });
  }

  private topic(
    name: string,
    messageType: string,
    resourceId: SemanticResourceId,
  ): ROSLIB.Topic {
    const topic = new ROSLIB.Topic({ ros: this.ros, name, messageType });
    topic.subscribe((message: unknown) => {
      this.options.onSample(resourceId, numericData(message, name));
    });
    return topic;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const topic of this.topics) {
      try {
        topic.unsubscribe();
      } catch {
        // Evidence shutdown should remain best-effort after a cut link.
      }
    }
    try {
      this.ros.close();
    } catch {
      // Same shutdown guarantee as above.
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listNodes(timeoutMs: number): Promise<readonly string[]> {
    const response = await this.callService(
      "/rosapi/nodes",
      "rosapi_msgs/srv/Nodes",
      {},
      timeoutMs,
    );
    const nodes = response.nodes;
    if (!Array.isArray(nodes) || !nodes.every((value) => typeof value === "string")) {
      throw new Error("Legacy reference /rosapi/nodes returned an invalid nodes array");
    }
    return nodes as string[];
  }

  async getParameter(name: string, timeoutMs: number): Promise<string> {
    const response = await this.callService(
      "/rosapi/get_param",
      "rosapi_msgs/srv/GetParam",
      { name, default_value: "" },
      timeoutMs,
    );
    if (typeof response.value !== "string") {
      throw new Error("Legacy reference /rosapi/get_param returned a non-string value");
    }
    return response.value;
  }

  private callService(
    name: string,
    serviceType: string,
    request: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!this.connected) {
      return Promise.reject(new Error(`Legacy reference service ${name} requires a connected ROSBridge`));
    }
    const service = new ROSLIB.Service({ ros: this.ros, name, serviceType });
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Legacy reference service ${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      try {
        service.callService(
          new ROSLIB.ServiceRequest(request),
          (value: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
              reject(new Error(`Legacy reference service ${name} returned a non-object response`));
              return;
            }
            resolve(value as Readonly<Record<string, unknown>>);
          },
          (error: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Legacy reference service ${name} failed: ${error}`));
          },
        );
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  private connect(): void {
    if (!this.running) return;
    this.options.onConnectionState?.("connecting");
    try {
      this.ros.connect(this.options.url);
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.reconnectDelayMs);
  }
}
