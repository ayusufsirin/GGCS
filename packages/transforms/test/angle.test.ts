import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import {
  TRANSFORM_COMPUTATION_IDS,
  TRANSFORMS_PLUGIN_ID,
  angleRadToDeg,
  createTransformsPlugin,
  quaternionToEulerComputation,
  radToDeg,
} from "../src/index.js";

describe("angle.radToDeg", () => {
  it("matches the legacy radians-to-degrees arithmetic", () => {
    const samples = [0, Math.PI / 2, -Math.PI, 0.123456789, -2.75];
    for (const value of samples) {
      expect(radToDeg(value)).toBeCloseTo(value * 180 / Math.PI, 12);
    }
  });

  it("registers as a generic number-to-number computation", () => {
    expect(angleRadToDeg.id).toBe(TRANSFORM_COMPUTATION_IDS.angleRadToDeg);
    expect(angleRadToDeg.inputs).toEqual({ input: CORE_TYPE_IDS.number });
    expect(angleRadToDeg.output).toBe(CORE_TYPE_IDS.number);
  });

  it("is exported by the renderer/transport-neutral transforms plugin", () => {
    const plugin = createTransformsPlugin();
    expect(plugin.manifest.id).toBe(TRANSFORMS_PLUGIN_ID);
    expect(plugin.computations).toEqual([angleRadToDeg, quaternionToEulerComputation]);
  });
});
