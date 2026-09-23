jest.mock("@ggcs/sensor-suite", () => ({
  compileSensorSuiteApplication: jest.fn(() => {
    throw new Error("production compiler must not be used by injected lifecycle tests");
  }),
  SENSOR_SUITE_RESOURCE_IDS: {
    navRollDeg: "nav.roll.deg",
    navPitchDeg: "nav.pitch.deg",
    navHeadingDeg: "nav.heading.deg",
    vehicleSpeed: "resource.value",
    navAltitudeM: "nav.altitude.m",
    navLatitudeDeg: "nav.latitude.deg",
    navLongitudeDeg: "nav.longitude.deg",
    arnavSatellites: "arnav.satellites",
    healthSystem: "arnav.health.system",
    healthRollPitch: "arnav.health.rollPitch",
    healthYaw: "arnav.health.yaw",
    healthPositionVelocity: "arnav.health.positionVelocity",
    healthMagnetometer: "arnav.health.magnetometer",
    healthGnssFixed: "arnav.health.gnssFixed",
    rtkFixedLegacy: "arnav.display.rtkFixedLegacy",
    vehicleAcceleration: "vehicle.acceleration",
    cameraZedRgbData: "camera.zed.rgb.data",
    zedRecordingStart: "zed.recording.start",
    zedRecordingStop: "zed.recording.stop",
    bagRecordingStart: "bag.recording.start",
    bagRecordingStop: "bag.recording.stop",
    parameters: "shadow.parameters",
  },
}));

import type { RuntimeResource, RuntimeState } from "@ggcs/core";
import { createSensorSuiteWebApplication, type SensorSuiteRuntimeLike } from "./sensor-suite-application";

class FakeRuntime implements SensorSuiteRuntimeLike {
  current: RuntimeState = "created";
  starts = 0;
  stops = 0;
  resources = new Map<string, RuntimeResource>();

  state() { return this.current; }
  async start() { this.starts += 1; this.current = "running"; }
  async stop() { this.stops += 1; this.current = "stopped"; }
  resource<T extends RuntimeResource = RuntimeResource>(id: string): T {
    const value = this.resources.get(id);
    if (!value) throw new Error(`missing fake resource ${id}`);
    return value as T;
  }
}

describe("M05 Sensor Suite Web application lifecycle", () => {
  test("always owns exactly one Runtime and stops it once", async () => {
    const runtime = new FakeRuntime();
    const createRuntime = jest.fn(() => runtime);
    const app = createSensorSuiteWebApplication(
      { rosbridgeUrl: "ws://runtime.invalid:9090" },
      { createRuntime },
    );

    expect(app.compatibility.runtimeState()).toBe("created");
    await app.start();
    await app.start();
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(createRuntime).toHaveBeenCalledWith({ rosbridgeUrl: "ws://runtime.invalid:9090" });
    expect(runtime.starts).toBe(1);
    expect(app.compatibility.runtimeState()).toBe("running");

    await app.stop();
    await app.stop();
    expect(runtime.stops).toBe(1);
  });

  test("resolves only explicitly mapped resources after Runtime start", async () => {
    const runtime = new FakeRuntime();
    const source = { kind: "source", id: "resource.value" } as RuntimeResource;
    runtime.resources.set("resource.value", source);
    const app = createSensorSuiteWebApplication(
      { rosbridgeUrl: "ws://runtime.invalid:9090" },
      { createRuntime: () => runtime },
    );

    expect(app.compatibility.resourceForPort("tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed", "value")).toBeUndefined();
    await app.start();
    expect(app.compatibility.resourceForPort("tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed", "value")).toBe(source);
    expect(app.compatibility.resourceForPort("tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed", "missing")).toBeUndefined();
  });

  test("cannot restart after stop", async () => {
    const app = createSensorSuiteWebApplication(
      { rosbridgeUrl: "ws://runtime.invalid:9090" },
      { createRuntime: () => new FakeRuntime() },
    );
    await app.start();
    await app.stop();
    await expect(app.start()).rejects.toThrow(/cannot restart/);
  });
});
