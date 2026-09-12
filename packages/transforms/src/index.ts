import { definePlugin, defineValueTransform } from "@ggcs/plugin-sdk";
import { CORE_TYPE_IDS } from "@ggcs/schema";

export const TRANSFORMS_PLUGIN_ID = "ggcs:transforms" as const;

export const TRANSFORM_COMPUTATION_IDS = {
  angleRadToDeg: "angle.radToDeg",
} as const;

/**
 * Convert radians to degrees using the same operation ordering as the legacy
 * Sensor Suite wrappers (`value * 180 / Math.PI`).
 */
export function radToDeg(value: number): number {
  return value * 180 / Math.PI;
}

export const angleRadToDeg = defineValueTransform<number, number>({
  id: TRANSFORM_COMPUTATION_IDS.angleRadToDeg,
  input: CORE_TYPE_IDS.number,
  output: CORE_TYPE_IDS.number,
  transform: radToDeg,
});

export function createTransformsPlugin() {
  return definePlugin({
    manifest: {
      id: TRANSFORMS_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    computations: [angleRadToDeg],
  });
}
