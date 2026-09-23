jest.mock("@ggcs/sensor-suite", () => ({
  compileSensorSuiteApplication: jest.fn(() => {
    throw new Error("production compiler must not be used by injected lifecycle tests");
  }),
}));

jest.mock("./compatibility-map", () => ({
  resolveCompatibilityBinding: jest.fn((instanceId: string, portName: string) =>
    instanceId === "widget" && portName === "value"
      ? { kind: "source", resourceId: "resource.value" }
      : undefined,
  ),
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

    expect(app.compatibility.resourceForPort("widget", "value")).toBeUndefined();
    await app.start();
    expect(app.compatibility.resourceForPort("widget", "value")).toBe(source);
    expect(app.compatibility.resourceForPort("widget", "missing")).toBeUndefined();
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
