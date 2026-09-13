import { describe, expect, it } from "vitest";
import {
  TRANSFORM_COMPUTATION_IDS,
  TRANSFORM_TYPE_IDS,
  createTransformsPlugin,
  quaternionToEuler,
  quaternionToEulerComputation,
  radToDeg,
  type Quaternion,
} from "../src/index.js";

function expectEulerClose(
  actual: ReturnType<typeof quaternionToEuler>,
  expected: { rollRad: number; pitchRad: number; yawRad: number },
) {
  expect(actual.rollRad).toBeCloseTo(expected.rollRad, 12);
  expect(actual.pitchRad).toBeCloseTo(expected.pitchRad, 12);
  expect(actual.yawRad).toBeCloseTo(expected.yawRad, 12);
}

describe("quaternion.toEuler", () => {
  it("maps the identity quaternion to zero roll/pitch/yaw", () => {
    expectEulerClose(quaternionToEuler({ x: 0, y: 0, z: 0, w: 1 }), {
      rollRad: 0,
      pitchRad: 0,
      yawRad: 0,
    });
  });

  it("matches representative normalized axis rotations", () => {
    const half = Math.sqrt(0.5);
    expectEulerClose(quaternionToEuler({ x: half, y: 0, z: 0, w: half }), {
      rollRad: Math.PI / 2,
      pitchRad: 0,
      yawRad: 0,
    });
    expectEulerClose(quaternionToEuler({ x: 0, y: 0, z: half, w: half }), {
      rollRad: 0,
      pitchRad: 0,
      yawRad: Math.PI / 2,
    });
  });

  it("preserves the legacy pitch saturation branch", () => {
    const half = Math.sqrt(0.5);
    const euler = quaternionToEuler({ x: 0, y: half, z: 0, w: half });
    expect(euler.pitchRad).toBeCloseTo(Math.PI / 2, 12);
  });

  it("rejects non-finite quaternion components", () => {
    expect(() => quaternionToEuler({ x: Number.NaN, y: 0, z: 0, w: 1 })).toThrow(/finite number/);
    expect(() => quaternionToEuler({ x: 0, y: 0, z: Number.POSITIVE_INFINITY, w: 1 })).toThrow(/finite number/);
  });

  it("registers semantic quaternion and Euler types plus the computation", () => {
    const plugin = createTransformsPlugin();
    expect(plugin.types?.map((type) => type.id)).toEqual([
      TRANSFORM_TYPE_IDS.quaternion,
      TRANSFORM_TYPE_IDS.eulerRpyRad,
    ]);
    expect(quaternionToEulerComputation).toMatchObject({
      id: TRANSFORM_COMPUTATION_IDS.quaternionToEuler,
      inputs: { input: TRANSFORM_TYPE_IDS.quaternion },
      output: TRANSFORM_TYPE_IDS.eulerRpyRad,
    });
  });

  it("matches the exact legacy IMU and Odometry wrapper field paths", () => {
    const quaternion: Quaternion = {
      x: 0.10259783520851541,
      y: -0.20519567041703082,
      z: 0.3077935056255462,
      w: 0.9233805168766387,
    };
    const imuMessage = { orientation: quaternion };
    const odometryMessage = { pose: { pose: { orientation: quaternion } } };

    const imuEuler = quaternionToEuler(imuMessage.orientation);
    const odometryEuler = quaternionToEuler(odometryMessage.pose.pose.orientation);

    expectEulerClose(imuEuler, odometryEuler);
    expect(radToDeg(imuEuler.rollRad)).toBeCloseTo(radToDeg(odometryEuler.rollRad), 12);
    expect(radToDeg(imuEuler.pitchRad)).toBeCloseTo(radToDeg(odometryEuler.pitchRad), 12);
    expect(radToDeg(imuEuler.yawRad)).toBeCloseTo(radToDeg(odometryEuler.yawRad), 12);
  });
});
