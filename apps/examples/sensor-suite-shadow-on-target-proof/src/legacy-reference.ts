import ROSLIB from "roslib";
import {
  SENSOR_SUITE_ACCELERATION_TOPIC,
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_RESOURCE_IDS,
  SENSOR_SUITE_SATELLITES_TOPIC,
  SENSOR_SUITE_SPEED_TOPIC,
  SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
  SENSOR_SUITE_ZED_RGB_TOPIC,
} from "@ggcs/example-sensor-suite-shadow-headless/definition";
import { ARNAV_INS_MESSAGE_TYPE } from "@ggcs/arnav";

export type OnTargetSemanticResourceId =
  | typeof SENSOR_SUITE_RESOURCE_IDS.navRollDeg
  | typeof SENSOR_SUITE_RESOURCE_IDS.navPitchDeg
  | typeof SENSOR_SUITE_RESOURCE_IDS.navHeadingDeg
  | typeof SENSOR_SUITE_RESOURCE_IDS.navAltitudeM
  | typeof SENSOR_SUITE_RESOURCE_IDS.navLatitudeDeg
  | typeof SENSOR_SUITE_RESOURCE_IDS.navLongitudeDeg
  | typeof SENSOR_SUITE_RESOURCE_IDS.vehicleSpeed
  | typeof SENSOR_SUITE_RESOURCE_IDS.vehicleAcceleration
  | typeof SENSOR_SUITE_RESOURCE_IDS.arnavSatellites
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthSystem
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthRollPitch
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthYaw
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthPositionVelocity
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthMagnetometer
  | typeof SENSOR_SUITE_RESOURCE_IDS.healthGnssFixed
  | typeof SENSOR_SUITE_RESOURCE_IDS.rtkFixedLegacy;

export type OnTargetSemanticValue = number | boolean;

export interface LegacyOnTargetObserverOptions {
  readonly url: string;
  readonly reconnectDelayMs?: number;
  onSample(resourceId: OnTargetSemanticResourceId, value: OnTargetSemanticValue, at: number): void;
  onConnectionState?(state: "disconnected" | "connecting" | "connected"): void;
  readonly includeCamera?: boolean;
  onCameraSample?(payloadLength: number, at: number): void;
}

function record(value: unknown, context: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function finiteNumber(message: Readonly<Record<string, unknown>>, field: string): number {
  const value = message[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Legacy ArNav field ${field} must be a finite number`);
  }
  return value;
}

function statusBoolean(message: Readonly<Record<string, unknown>>, field: string): boolean {
  const status = record(message.status, "Legacy ArNav status");
  const value = status[field];
  if (typeof value !== "boolean") throw new Error(`Legacy ArNav status.${field} must be boolean`);
  return value;
}

function numericData(message: unknown, topic: string): number {
  const value = record(message, `Legacy ${topic} message`).data;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Legacy ${topic} data must be a finite number`);
  }
  return value;
}

function radToDeg(value: number): number {
  return value * 180 / Math.PI;
}

export class LegacyOnTargetObserver {
  private readonly ros = new ROSLIB.Ros({});
  private readonly reconnectDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private connected = false;
  private readonly topics: ROSLIB.Topic[] = [];

  constructor(private readonly options: LegacyOnTargetObserverOptions) {
    this.reconnectDelayMs = options.reconnectDelayMs ?? 500;
    this.topics.push(
      this.arnavTopic(),
      this.numericTopic(SENSOR_SUITE_SPEED_TOPIC, "std_msgs/msg/Float64", SENSOR_SUITE_RESOURCE_IDS.vehicleSpeed),
      this.numericTopic(SENSOR_SUITE_ACCELERATION_TOPIC, "std_msgs/msg/Float64", SENSOR_SUITE_RESOURCE_IDS.vehicleAcceleration),
      this.numericTopic(SENSOR_SUITE_SATELLITES_TOPIC, "std_msgs/msg/Int64", SENSOR_SUITE_RESOURCE_IDS.arnavSatellites),
    );
    if (options.includeCamera === true) this.topics.push(this.cameraTopic());
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
      // close owns reconnect scheduling so error+close cannot duplicate loops.
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const topic of this.topics) {
      try { topic.unsubscribe(); } catch { /* best-effort evidence shutdown */ }
    }
    try { this.ros.close(); } catch { /* best-effort evidence shutdown */ }
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
      throw new Error("Legacy on-target /rosapi/nodes returned an invalid nodes array");
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
      throw new Error("Legacy on-target /rosapi/get_param returned a non-string value");
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
      return Promise.reject(new Error(`Legacy on-target service ${name} requires a connected ROSBridge`));
    }
    const service = new ROSLIB.Service({ ros: this.ros, name, serviceType });
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Legacy on-target service ${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      try {
        service.callService(
          new ROSLIB.ServiceRequest(request),
          (value: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(record(value, `Legacy on-target service ${name} response`));
          },
          (error: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Legacy on-target service ${name} failed: ${error}`));
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

  private emit(resourceId: OnTargetSemanticResourceId, value: OnTargetSemanticValue, at: number): void {
    this.options.onSample(resourceId, value, at);
  }

  private arnavTopic(): ROSLIB.Topic {
    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: SENSOR_SUITE_ARNAV_TOPIC,
      messageType: ARNAV_INS_MESSAGE_TYPE,
    });
    topic.subscribe((message: unknown) => {
      const value = record(message, "Legacy ArNav INS message");
      const at = Date.now();
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navRollDeg, radToDeg(finiteNumber(value, "roll_rad")), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navPitchDeg, radToDeg(finiteNumber(value, "pitch_rad")), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navHeadingDeg, radToDeg(finiteNumber(value, "yaw_rad")), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navAltitudeM, finiteNumber(value, "h_m"), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navLatitudeDeg, radToDeg(finiteNumber(value, "lat_rad")), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.navLongitudeDeg, radToDeg(finiteNumber(value, "lon_rad")), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthSystem, statusBoolean(value, "system_ok"), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthRollPitch, statusBoolean(value, "roll_pitch_ok"), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthYaw, statusBoolean(value, "yaw_ok"), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthPositionVelocity, statusBoolean(value, "pos_vel_ok"), at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthMagnetometer, statusBoolean(value, "mag_ok"), at);
      const gnssFixed = statusBoolean(value, "gnss_fixed");
      this.emit(SENSOR_SUITE_RESOURCE_IDS.healthGnssFixed, gnssFixed, at);
      this.emit(SENSOR_SUITE_RESOURCE_IDS.rtkFixedLegacy, gnssFixed, at);
    });
    return topic;
  }

  private cameraTopic(): ROSLIB.Topic {
    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: SENSOR_SUITE_ZED_RGB_TOPIC,
      messageType: SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
    });
    topic.subscribe((message: unknown) => {
      const data = record(message, "Legacy ZED compressed image message").data;
      if (typeof data !== "string") throw new Error("Legacy ZED compressed image data must be a base64 string");
      this.options.onCameraSample?.(data.length, Date.now());
    });
    return topic;
  }

  private numericTopic(
    name: string,
    messageType: string,
    resourceId: OnTargetSemanticResourceId,
  ): ROSLIB.Topic {
    const topic = new ROSLIB.Topic({ ros: this.ros, name, messageType });
    topic.subscribe((message: unknown) => {
      this.emit(resourceId, numericData(message, name), Date.now());
    });
    return topic;
  }

  private connect(): void {
    if (!this.running) return;
    this.options.onConnectionState?.("connecting");
    try { this.ros.connect(this.options.url); } catch { this.scheduleReconnect(); }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.reconnectDelayMs);
  }
}
