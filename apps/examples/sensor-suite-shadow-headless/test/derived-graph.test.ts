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
} from "../src/definition.js";

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
} satisfies RosMessage;

function createFixtureRuntime() {
  const testing = createTestingPlugin();
  const rawId = SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw;
  const compiled = compileApplication(
    {
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", ROS_PLUGIN_ID, TRANSFORMS_PLUGIN_ID, ARNAV_PLUGIN_ID],
      resources: [
        {
          id: rawId,
          provider: TEST_PROVIDER_IDS.source,
          type: ARNAV_INS_TYPE_ID,
          config: { initial: fixture, staleAfterMs: 50 },
        },
        ...createArnavSemanticResources(rawId),
      ],
    },
    createRegistryBuilder()
      .register(testing.plugin)
      .register(createRosDomainPlugin({ messageTypes: [ARNAV_INS_MESSAGE_TYPE] }))
      .register(createTransformsPlugin())
      .register(createArnavPlugin()),
  );
  const clock = new FakeClock();
  return { clock, runtime: compiled.createRuntime({ clock }) };
}

describe("Sensor Suite ArNav derived graph parity", () => {
  it("produces the legacy navigation and health semantics from one raw fixture", async () => {
    const { runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    expect(runtime.resource<Source<number>>(ids.navRollDeg).current()).toMatchObject({ state: "fresh", value: fixture.roll_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navPitchDeg).current()).toMatchObject({ state: "fresh", value: fixture.pitch_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navHeadingDeg).current()).toMatchObject({ state: "fresh", value: fixture.yaw_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navLatitudeDeg).current()).toMatchObject({ state: "fresh", value: fixture.lat_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navLongitudeDeg).current()).toMatchObject({ state: "fresh", value: fixture.lon_rad * 180 / Math.PI });
    expect(runtime.resource<Source<number>>(ids.navAltitudeM).current()).toMatchObject({ state: "fresh", value: 123.45 });
    expect(runtime.resource<Source<boolean>>(ids.healthSystem).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthRollPitch).current()).toMatchObject({ state: "fresh", value: false });
    expect(runtime.resource<Source<boolean>>(ids.healthYaw).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthPositionVelocity).current()).toMatchObject({ state: "fresh", value: false });
    expect(runtime.resource<Source<boolean>>(ids.healthMagnetometer).current()).toMatchObject({ state: "fresh", value: true });
    expect(runtime.resource<Source<boolean>>(ids.healthGnssFixed).current()).toMatchObject({ state: "fresh", value: true });
    await runtime.stop();
  });

  it("propagates stale and unavailable state through the full derived chain", async () => {
    const { clock, runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    const raw = runtime.resource<TestSource<RosMessage>>(ids.arnavInsRaw);
    const heading = runtime.resource<Source<number>>(ids.navHeadingDeg);
    const health = runtime.resource<Source<boolean>>(ids.healthGnssFixed);

    clock.advanceBy(50);
    expect(heading.current()).toMatchObject({ state: "stale" });
    expect(health.current()).toMatchObject({ state: "stale" });

    raw.setUnavailable();
    expect(heading.current()).toMatchObject({ state: "unavailable" });
    expect(health.current()).toMatchObject({ state: "unavailable" });
    await runtime.stop();
  });

  it("propagates structured raw-source errors without converting them to fresh values", async () => {
    const { runtime } = createFixtureRuntime();
    await runtime.start();
    const ids = SENSOR_SUITE_RESOURCE_IDS;
    runtime.resource<TestSource<RosMessage>>(ids.arnavInsRaw).setError(
      new RuntimeError({
        code: "M03_FIXTURE_INPUT_ERROR",
        category: "resource_error",
        message: "fixture input failed",
      }),
    );
    expect(runtime.resource<Source<number>>(ids.navRollDeg).current()).toMatchObject({
      state: "error",
      error: { code: "M03_FIXTURE_INPUT_ERROR" },
    });
    expect(runtime.resource<Source<boolean>>(ids.healthSystem).current()).toMatchObject({
      state: "error",
      error: { code: "M03_FIXTURE_INPUT_ERROR" },
    });
    await runtime.stop();
  });
});
