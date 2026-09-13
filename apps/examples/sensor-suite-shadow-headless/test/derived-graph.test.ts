import { describe, expect, it } from "vitest";
import {
  RuntimeError,
  compileApplication,
  createRegistryBuilder,
  type Source,
} from "@ggcs/core";
import {
  ARNAV_INS_MESSAGE_TYPE,
  ARNAV_INS_TYPE_ID,
  ARNAV_PLUGIN_ID,
  createArnavPlugin,
} from "@ggcs/arnav";
import { ROS_PLUGIN_ID, createRosDomainPlugin, type RosMessage } from "@ggcs/ros";
import {
  ROS_STD_MESSAGE_TYPES,
  ROS_STD_MSGS_PLUGIN_ID,
  ROS_STD_TYPE_IDS,
  createRosStdMsgsPlugin,
} from "@ggcs/ros-std-msgs";
import { GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import {
  FakeClock,
  TEST_PROVIDER_IDS,
  TestSource,
  createTestingPlugin,
} from "@ggcs/testing";
import { TRANSFORMS_PLUGIN_ID, createTransformsPlugin } from "@ggcs/transforms";
import {
  SENSOR_SUITE_RESOURCE_IDS,
  createArnavSemanticResources,
  createNumericSemanticResources,
} from "../src/definition.js";

const arnavFixture = {
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
} satisfies RosMessage;

const speedFixture = { data: 12.5 } satisfies RosMessage;
const accelerationFixture = { data: -0.75 } satisfies RosMessage;
const satellitesFixture = { data: 11 } satisfies RosMessage;

function createFixtureRuntime() {
  const testing = createTestingPlugin();
  const ids = SENSOR_SUITE_RESOURCE_IDS;
  const compiled = compileApplication(
    {
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: [
        "testing:plugin",
        ROS_PLUGIN_ID,
        ROS_STD_MSGS_PLUGIN_ID,
        TRANSFORMS_PLUGIN_ID,
        ARNAV_PLUGIN_ID,
      ],
      resources: [
        {
          id: ids.arnavInsRaw,
          provider: TEST_PROVIDER_IDS.source,
          type: ARNAV_INS_TYPE_ID,
          config: { initial: arnavFixture, staleAfterMs: 50 },
        },
        {
          id: ids.vehicleSpeedRaw,
          provider: TEST_PROVIDER_IDS.source,
          type: ROS_STD_TYPE_IDS.float64,
          config: { initial: speedFixture, staleAfterMs: 50 },
        },
        {
          id: ids.vehicleAccelerationRaw,
          provider: TEST_PROVIDER_IDS.source,
          type: ROS_STD_TYPE_IDS.float64,
          config: { initial: accelerationFixture, staleAfterMs: 50 },
        },
        {
          id: ids.arnavSatellitesRaw,
          provider: TEST_PROVIDER_IDS.source,
          type: ROS_STD_TYPE_IDS.int64,
          config: { initial: satellitesFixture, staleAfterMs: 50 },
        },
        ...createArnavSemanticResources(ids.arnavInsRaw),
        ...createNumericSemanticResources({
          speedRawSourceId: ids.vehicleSpeedRaw,
          accelerationRawSourceId: ids.vehicleAccelerationRaw,
          satellitesRawSourceId: ids.arnavSatellitesRaw,
        }),
      ],
    },
    createRegistryBuilder()
      .register(testing.plugin)
      .register(createRosDomainPlugin({
        messageTypes: [
          ARNAV_INS_MESSAGE_TYPE,
          ROS_STD_MESSAGE_TYPES.float64,
          ROS_STD_MESSAGE_TYPES.int64,
        ],
      }))
      .register(createRosStdMsgsPlugin())
      .register(createTransformsPlugin())
      .register(createArnavPlugin()),
  );
  const clock = new FakeClock();
  return { clock, runtime: compiled.createRuntime({ clock }) };
}

describe("Sensor Suite deterministic derived graph parity", () => {
  it("produces the legacy ArNav navigation and health semantics", async () => {
    const { runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    expect(runtime.resource<Source<number>>(ids.navRollDeg).current()).toMatchObject({ state: "fresh", value: arnavFixture.roll_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navPitchDeg).current()).toMatchObject({ state: "fresh", value: arnavFixture.pitch_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navHeadingDeg).current()).toMatchObject({ state: "fresh", value: arnavFixture.yaw_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navLatitudeDeg).current()).toMatchObject({ state: "fresh", value: arnavFixture.lat_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navLongitudeDeg).current()).toMatchObject({ state: "fresh", value: arnavFixture.lon_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navAltitudeM).current()).toMatchObject({ state: "fresh", value: 123.45 });
    expect(runtime.resource<Source<boolean>>(ids.healthSystem).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthRollPitch).current()).toMatchObject({ state: "fresh", value: false });
    expect(runtime.resource<Source<boolean>>(ids.healthYaw).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthPositionVelocity).current()).toMatchObject({ state: "fresh", value: false });
    expect(runtime.resource<Source<boolean>>(ids.healthMagnetometer).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthGnssFixed).current()).toMatchObject({ state: "fresh", value: true });
    await runtime.stop();
  });

  it("preserves speed, acceleration, and satellite .data semantics", async () => {
    const { runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    expect(runtime.resource<Source<number>>(ids.vehicleSpeed).current()).toMatchObject({ state: "fresh", value: 12.5 });
    expect(runtime.resource<Source<number>>(ids.vehicleAcceleration).current()).toMatchObject({ state: "fresh", value: -0.75 });
    expect(runtime.resource<Source<number>>(ids.arnavSatellites).current()).toMatchObject({ state: "fresh", value: 11 });
    await runtime.stop();
  });

  it("propagates stale and unavailable state through ArNav and numeric chains", async () => {
    const { clock, runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;

    clock.advanceBy(50);
    for (const id of [ids.navHeadingDeg, ids.vehicleSpeed, ids.vehicleAcceleration, ids.arnavSatellites]) {
      expect(runtime.resource<Source<number>>(id).current()).toMatchObject({ state: "stale" });
    }
    expect(runtime.resource<Source<boolean>>(ids.healthGnssFixed).current()).toMatchObject({ state: "stale" });

    runtime.resource<TestSource<RosMessage>>(ids.arnavInsRaw).setUnavailable();
    runtime.resource<TestSource<RosMessage>>(ids.vehicleSpeedRaw).setUnavailable();
    runtime.resource<TestSource<RosMessage>>(ids.vehicleAccelerationRaw).setUnavailable();
    runtime.resource<TestSource<RosMessage>>(ids.arnavSatellitesRaw).setUnavailable();

    for (const id of [ids.navHeadingDeg, ids.vehicleSpeed, ids.vehicleAcceleration, ids.arnavSatellites]) {
      expect(runtime.resource<Source<number>>(id).current()).toMatchObject({ state: "unavailable" });
    }
    expect(runtime.resource<Source<boolean>>(ids.healthGnssFixed).current()).toMatchObject({ state: "unavailable" });
    await runtime.stop();
  });

  it("propagates structured raw-source errors through ArNav and numeric chains", async () => {
    const { runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    const error = new RuntimeError({
      code: "M03_FIXTURE_INPUT_ERROR",
      category: "resource_error",
      message: "fixture input failed",
    });
    runtime.resource<TestSource<RosMessage>>(ids.arnavInsRaw).setError(error);
    runtime.resource<TestSource<RosMessage>>(ids.vehicleSpeedRaw).setError(error);
    runtime.resource<TestSource<RosMessage>>(ids.vehicleAccelerationRaw).setError(error);
    runtime.resource<TestSource<RosMessage>>(ids.arnavSatellitesRaw).setError(error);

    for (const id of [ids.navRollDeg, ids.vehicleSpeed, ids.vehicleAcceleration, ids.arnavSatellites]) {
      expect(runtime.resource<Source<number>>(id).current()).toMatchObject({
        state: "error",
        error: { code: "M03_FIXTURE_INPUT_ERROR" },
      });
    }
    expect(runtime.resource<Source<boolean>>(ids.healthSystem).current()).toMatchObject({
      state: "error",
      error: { code: "M03_FIXTURE_INPUT_ERROR" },
    });
    await runtime.stop();
  });
});
