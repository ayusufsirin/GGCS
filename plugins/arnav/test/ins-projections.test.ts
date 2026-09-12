import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import {
  ARNAV_COMPUTATION_IDS,
  ARNAV_INS_TYPE_ID,
  ARNAV_PLUGIN_ID,
  arnavComputations,
  createArnavPlugin,
  projectArnavIns,
} from "../src/index.js";

const fixture = {
  roll_rad: 0.125,
  pitch_rad: -0.25,
  yaw_rad: 1.5,
  lat_rad: 0.72,
  lon_rad: 0.51,
  h_m: 123.45,
  status: {
    system_ok: true,
    roll_pitch_ok: false,
    yaw_ok: true,
    pos_vel_ok: false,
    mag_ok: true,
    gnss_fixed: true,
  },
} as const;

describe("ArNav INS projections", () => {
  it("matches the active prod/rtk/test navigation fields", () => {
    expect(projectArnavIns.rollRad(fixture)).toBe(0.125);
    expect(projectArnavIns.pitchRad(fixture)).toBe(-0.25);
    expect(projectArnavIns.yawRad(fixture)).toBe(1.5);
    expect(projectArnavIns.latitudeRad(fixture)).toBe(0.72);
    expect(projectArnavIns.longitudeRad(fixture)).toBe(0.51);
    expect(projectArnavIns.altitudeM(fixture)).toBe(123.45);
  });

  it("matches all active prod/rtk/test health fields", () => {
    expect(projectArnavIns.healthSystem(fixture)).toBe(true);
    expect(projectArnavIns.healthRollPitch(fixture)).toBe(false);
    expect(projectArnavIns.healthYaw(fixture)).toBe(true);
    expect(projectArnavIns.healthPositionVelocity(fixture)).toBe(false);
    expect(projectArnavIns.healthMagnetometer(fixture)).toBe(true);
    expect(projectArnavIns.healthGnssFixed(fixture)).toBe(true);
  });

  it("rejects malformed domain payloads instead of fabricating values", () => {
    expect(() => projectArnavIns.rollRad({ roll_rad: "0.1" })).toThrow(/roll_rad/);
    expect(() => projectArnavIns.healthSystem({ status: { system_ok: 1 } })).toThrow(/status\.system_ok/);
  });

  it("registers projections from the raw ArNav ROS type to core scalar types", () => {
    const byId = new Map(arnavComputations.map((computation) => [computation.id, computation]));
    expect(byId.get(ARNAV_COMPUTATION_IDS.rollRad)?.inputs).toEqual({ input: ARNAV_INS_TYPE_ID });
    expect(byId.get(ARNAV_COMPUTATION_IDS.rollRad)?.output).toBe(CORE_TYPE_IDS.number);
    expect(byId.get(ARNAV_COMPUTATION_IDS.healthGnssFixed)?.output).toBe(CORE_TYPE_IDS.boolean);
  });

  it("declares the ROS domain plugin dependency without ROSBridge coupling", () => {
    const plugin = createArnavPlugin();
    expect(plugin.manifest.id).toBe(ARNAV_PLUGIN_ID);
    expect(plugin.manifest.requires).toEqual([{ id: "ggcs:ros", version: "^0.1.0" }]);
    expect(plugin.computations).toEqual(arnavComputations);
  });
});
