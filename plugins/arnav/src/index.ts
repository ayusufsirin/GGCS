import { definePlugin, defineValueTransform } from "@ggcs/plugin-sdk";
import { rosMessageTypeId, type RosMessage } from "@ggcs/ros";
import { CORE_TYPE_IDS } from "@ggcs/schema";

export const ARNAV_PLUGIN_ID = "ggcs:arnav" as const;
export const ARNAV_INS_MESSAGE_TYPE = "ardiclabs_arnav_msgs/msg/Ins" as const;
export const ARNAV_INS_TYPE_ID = rosMessageTypeId(ARNAV_INS_MESSAGE_TYPE);

export const ARNAV_COMPUTATION_IDS = {
  rollRad: "arnav.ins.rollRad",
  pitchRad: "arnav.ins.pitchRad",
  yawRad: "arnav.ins.yawRad",
  latitudeRad: "arnav.ins.latitudeRad",
  longitudeRad: "arnav.ins.longitudeRad",
  altitudeM: "arnav.ins.altitudeM",
  healthSystem: "arnav.ins.health.system",
  healthRollPitch: "arnav.ins.health.rollPitch",
  healthYaw: "arnav.ins.health.yaw",
  healthPositionVelocity: "arnav.ins.health.positionVelocity",
  healthMagnetometer: "arnav.ins.health.magnetometer",
  healthGnssFixed: "arnav.ins.health.gnssFixed",
} as const;

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`ArNav INS field ${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireNumber(message: RosMessage, field: string): number {
  const value = message[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ArNav INS field ${field} must be a finite number`);
  }
  return value;
}

function requireStatusBoolean(message: RosMessage, field: string): boolean {
  const status = requireRecord(message.status, "status");
  const value = status[field];
  if (typeof value !== "boolean") {
    throw new Error(`ArNav INS field status.${field} must be boolean`);
  }
  return value;
}

export const projectArnavIns = {
  rollRad: (message: RosMessage): number => requireNumber(message, "roll_rad"),
  pitchRad: (message: RosMessage): number => requireNumber(message, "pitch_rad"),
  yawRad: (message: RosMessage): number => requireNumber(message, "yaw_rad"),
  latitudeRad: (message: RosMessage): number => requireNumber(message, "lat_rad"),
  longitudeRad: (message: RosMessage): number => requireNumber(message, "lon_rad"),
  altitudeM: (message: RosMessage): number => requireNumber(message, "h_m"),
  healthSystem: (message: RosMessage): boolean => requireStatusBoolean(message, "system_ok"),
  healthRollPitch: (message: RosMessage): boolean => requireStatusBoolean(message, "roll_pitch_ok"),
  healthYaw: (message: RosMessage): boolean => requireStatusBoolean(message, "yaw_ok"),
  healthPositionVelocity: (message: RosMessage): boolean => requireStatusBoolean(message, "pos_vel_ok"),
  healthMagnetometer: (message: RosMessage): boolean => requireStatusBoolean(message, "mag_ok"),
  healthGnssFixed: (message: RosMessage): boolean => requireStatusBoolean(message, "gnss_fixed"),
} as const;

function numberProjection(id: string, transform: (message: RosMessage) => number) {
  return defineValueTransform<RosMessage, number>({
    id,
    input: ARNAV_INS_TYPE_ID,
    output: CORE_TYPE_IDS.number,
    transform,
  });
}

function booleanProjection(id: string, transform: (message: RosMessage) => boolean) {
  return defineValueTransform<RosMessage, boolean>({
    id,
    input: ARNAV_INS_TYPE_ID,
    output: CORE_TYPE_IDS.boolean,
    transform,
  });
}

export const arnavComputations = [
  numberProjection(ARNAV_COMPUTATION_IDS.rollRad, projectArnavIns.rollRad),
  numberProjection(ARNAV_COMPUTATION_IDS.pitchRad, projectArnavIns.pitchRad),
  numberProjection(ARNAV_COMPUTATION_IDS.yawRad, projectArnavIns.yawRad),
  numberProjection(ARNAV_COMPUTATION_IDS.latitudeRad, projectArnavIns.latitudeRad),
  numberProjection(ARNAV_COMPUTATION_IDS.longitudeRad, projectArnavIns.longitudeRad),
  numberProjection(ARNAV_COMPUTATION_IDS.altitudeM, projectArnavIns.altitudeM),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthSystem, projectArnavIns.healthSystem),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthRollPitch, projectArnavIns.healthRollPitch),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthYaw, projectArnavIns.healthYaw),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthPositionVelocity, projectArnavIns.healthPositionVelocity),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthMagnetometer, projectArnavIns.healthMagnetometer),
  booleanProjection(ARNAV_COMPUTATION_IDS.healthGnssFixed, projectArnavIns.healthGnssFixed),
] as const;

export function createArnavPlugin() {
  return definePlugin({
    manifest: {
      id: ARNAV_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
      requires: [{ id: "ggcs:ros", version: "^0.1.0" }],
    },
    computations: arnavComputations,
  });
}
