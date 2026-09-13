import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import {
  ROS_STD_COMPUTATION_IDS,
  ROS_STD_MSGS_PLUGIN_ID,
  ROS_STD_TYPE_IDS,
  createRosStdMsgsPlugin,
  float64Data,
  int64Data,
  projectFloat64Data,
  projectInt64Data,
} from "../src/index.js";

describe("ROS std_msgs scalar projections", () => {
  it("preserves Float64.data without coercion", () => {
    expect(projectFloat64Data({ data: 12.5 })).toBe(12.5);
    expect(projectFloat64Data({ data: -0 })).toBe(-0);
  });

  it("preserves Int64.data as the numeric payload supplied by transport", () => {
    expect(projectInt64Data({ data: 11 })).toBe(11);
    expect(projectInt64Data({ data: -3 })).toBe(-3);
  });

  it("rejects non-number and non-finite payloads rather than coercing them", () => {
    for (const value of ["12", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => projectFloat64Data({ data: value })).toThrow(/finite number/);
      expect(() => projectInt64Data({ data: value })).toThrow(/finite number/);
    }
  });

  it("registers typed Float64 and Int64 computations", () => {
    expect(float64Data).toMatchObject({
      id: ROS_STD_COMPUTATION_IDS.float64Data,
      inputs: { input: ROS_STD_TYPE_IDS.float64 },
      output: CORE_TYPE_IDS.number,
    });
    expect(int64Data).toMatchObject({
      id: ROS_STD_COMPUTATION_IDS.int64Data,
      inputs: { input: ROS_STD_TYPE_IDS.int64 },
      output: CORE_TYPE_IDS.number,
    });
  });

  it("declares the ROS domain plugin requirement without transport coupling", () => {
    const plugin = createRosStdMsgsPlugin();
    expect(plugin.manifest.id).toBe(ROS_STD_MSGS_PLUGIN_ID);
    expect(plugin.manifest.requires).toEqual([{ id: "ggcs:ros", version: "^0.1.0" }]);
    expect(plugin.computations).toEqual([float64Data, int64Data]);
  });
});
