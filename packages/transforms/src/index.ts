import { definePlugin, defineType, defineValueTransform } from "@ggcs/plugin-sdk";
import { CORE_TYPE_IDS, type TypeDescriptor } from "@ggcs/schema";

export const TRANSFORMS_PLUGIN_ID = "ggcs:transforms" as const;

export const TRANSFORM_TYPE_IDS = {
  quaternion: "ggcs:type/quaternion",
  eulerRpyRad: "ggcs:type/euler-rpy-rad",
} as const;

export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface EulerRpyRad {
  readonly rollRad: number;
  readonly pitchRad: number;
  readonly yawRad: number;
}

export const quaternionType: TypeDescriptor<Quaternion> = defineType<Quaternion>({
  id: TRANSFORM_TYPE_IDS.quaternion,
  title: "Quaternion",
  description: "Finite x/y/z/w quaternion components.",
  schema: {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
      w: { type: "number" },
    },
    required: ["x", "y", "z", "w"],
    additionalProperties: false,
  },
});

export const eulerRpyRadType: TypeDescriptor<EulerRpyRad> = defineType<EulerRpyRad>({
  id: TRANSFORM_TYPE_IDS.eulerRpyRad,
  title: "Euler RPY (radians)",
  description: "Roll, pitch, and yaw angles in radians.",
  schema: {
    type: "object",
    properties: {
      rollRad: { type: "number" },
      pitchRad: { type: "number" },
      yawRad: { type: "number" },
    },
    required: ["rollRad", "pitchRad", "yawRad"],
    additionalProperties: false,
  },
});

export const TRANSFORM_COMPUTATION_IDS = {
  angleRadToDeg: "angle.radToDeg",
  quaternionToEuler: "quaternion.toEuler",
} as const;

/**
 * Convert radians to degrees using the same operation ordering as the legacy
 * Sensor Suite wrappers (`value * 180 / Math.PI`).
 */
export function radToDeg(value: number): number {
  return value * 180 / Math.PI;
}

function requireFiniteQuaternion(quaternion: Quaternion): void {
  for (const [field, value] of Object.entries(quaternion)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Quaternion field ${field} must be a finite number`);
    }
  }
}

/**
 * Convert a quaternion to roll/pitch/yaw radians using the exact operation
 * ordering and pitch saturation rule from the legacy Sensor Suite config.
 */
export function quaternionToEuler(quaternion: Quaternion): EulerRpyRad {
  requireFiniteQuaternion(quaternion);
  const { x: qx, y: qy, z: qz, w: qw } = quaternion;

  const sinrCosp = 2 * (qw * qx + qy * qz);
  const cosrCosp = 1 - 2 * (qx * qx + qy * qy);
  const rollRad = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (qw * qy - qz * qx);
  const pitchRad = Math.abs(sinp) >= 1
    ? Math.sign(sinp) * (Math.PI / 2)
    : Math.asin(sinp);

  const sinyCosp = 2 * (qw * qz + qx * qy);
  const cosyCosp = 1 - 2 * (qy * qy + qz * qz);
  const yawRad = Math.atan2(sinyCosp, cosyCosp);

  return { rollRad, pitchRad, yawRad };
}

export const angleRadToDeg = defineValueTransform<number, number>({
  id: TRANSFORM_COMPUTATION_IDS.angleRadToDeg,
  input: CORE_TYPE_IDS.number,
  output: CORE_TYPE_IDS.number,
  transform: radToDeg,
});

export const quaternionToEulerComputation = defineValueTransform<Quaternion, EulerRpyRad>({
  id: TRANSFORM_COMPUTATION_IDS.quaternionToEuler,
  input: TRANSFORM_TYPE_IDS.quaternion,
  output: TRANSFORM_TYPE_IDS.eulerRpyRad,
  transform: quaternionToEuler,
});

export function createTransformsPlugin() {
  return definePlugin({
    manifest: {
      id: TRANSFORMS_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    types: [quaternionType, eulerRpyRadType],
    computations: [angleRadToDeg, quaternionToEulerComputation],
  });
}
