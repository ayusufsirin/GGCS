jest.mock("@ggcs/sensor-suite", () => ({
  compileSensorSuiteApplication: jest.fn(() => {
    throw new Error("production compiler must not be used by injected lifecycle tests");
  }),
}));

jest.mock("./compatibility-map", () => ({
  resolveCompatibilityBinding: jest.fn(() => undefined),
  resolveCompatibilityCapability: jest.fn(() => undefined),
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

describe("Sensor Suite Web application lifecycle", () => {
  test("legacy mode does not create or start a Runtime", async () => {
    const createRuntime = jest.fn(() => new FakeRuntime());
    const app = createSensorSuiteWebApplication(
      { mode: "legacy", rosbridgeUrl: "ws://unused.invalid:9090" },
      { createRuntime },
    );

    await app.start();
    await app.stop();

    expect(createRuntime).not.toHaveBeenCalled();
    expect(app.compatibility.runtimeState()).toBe("disabled");
  });

  test("shadow mode owns one Runtime across repeated start calls and stops it once", async () => {
    const runtime = new FakeRuntime();
    const createRuntime = jest.fn(() => runtime);
    const app = createSensorSuiteWebApplication(
      { mode: "shadow", rosbridgeUrl: "ws://shadow.invalid:9090" },
      { createRuntime },
    );

    await app.start();
    await app.start();
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.starts).toBe(1);
    expect(app.compatibility.runtimeState()).toBe("running");

    await app.stop();
    await app.stop();
    expect(runtime.stops).toBe(1);
  });

  test("compat-read owns one Runtime while compat-full remains gated", async () => {
    const runtime = new FakeRuntime();
    const createRuntime = jest.fn(() => runtime);
    const app = createSensorSuiteWebApplication(
      { mode: "compat-read", rosbridgeUrl: "ws://compat.invalid:9090" },
      { createRuntime },
    );

    await app.start();
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.starts).toBe(1);
    expect(app.compatibility.runtimeState()).toBe("running");
    await app.stop();

    expect(() => createSensorSuiteWebApplication(
      { mode: "compat-full", rosbridgeUrl: "ws://unused.invalid:9090" },
      { createRuntime },
    )).toThrow(/not enabled in M04-S2/);
  });
});
