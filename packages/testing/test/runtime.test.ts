import { describe, expect, it } from "vitest";
import {
  RuntimeError,
  compileApplication,
  createRegistryBuilder,
} from "@ggcs/core";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import { FakeClock, TEST_PROVIDER_IDS, TestSource, createTestingPlugin } from "../src/index.js";

function basicDefinition() {
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: ["testing:plugin"],
    resources: [
      {
        id: "a",
        provider: TEST_PROVIDER_IDS.source,
        type: CORE_TYPE_IDS.number,
        config: { initial: 1 },
      },
      {
        id: "b",
        provider: TEST_PROVIDER_IDS.source,
        type: CORE_TYPE_IDS.number,
        config: { initial: 2, dependsOn: ["a"] },
      },
    ],
  } as const;
}

describe("Runtime lifecycle/provider orchestration", () => {
  it("has no live provider side effects before start and disposes in reverse order", async () => {
    const testing = createTestingPlugin();
    const compiled = compileApplication(basicDefinition(), createRegistryBuilder().register(testing.plugin));
    expect(testing.events.filter((event) => event.phase === "create")).toHaveLength(0);

    const runtime = compiled.createRuntime({ clock: new FakeClock() });
    const start1 = runtime.start();
    const start2 = runtime.start();
    expect(start2).toBe(start1);
    await start1;
    expect(runtime.state()).toBe("running");
    expect(testing.events.filter((event) => event.phase === "create").map((event) => event.resourceId)).toEqual(["a", "b"]);

    await runtime.start();
    await runtime.stop();
    await runtime.stop();
    expect(testing.events.filter((event) => event.phase === "dispose").map((event) => event.resourceId)).toEqual(["b", "a"]);
    await expect(runtime.start()).rejects.toMatchObject({ code: "GGCS_RUNTIME_RESTART_UNSUPPORTED" });
  });

  it("isolates multiple runtime instances", async () => {
    const testing = createTestingPlugin();
    const compiled = compileApplication(basicDefinition(), createRegistryBuilder().register(testing.plugin));
    const runtimeA = compiled.createRuntime({ clock: new FakeClock() });
    const runtimeB = compiled.createRuntime({ clock: new FakeClock() });
    await Promise.all([runtimeA.start(), runtimeB.start()]);
    const a = runtimeA.resource<TestSource<number>>("a");
    const b = runtimeB.resource<TestSource<number>>("a");
    a.emit(99);
    expect(a.current()).toMatchObject({ value: 99 });
    expect(b.current()).toMatchObject({ value: 1 });
    await Promise.all([runtimeA.stop(), runtimeB.stop()]);
  });

  it("rejects dependency cycles before Runtime start", () => {
    const testing = createTestingPlugin();
    const definition = {
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin"],
      resources: [
        { id: "a", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { dependsOn: ["b"] } },
        { id: "b", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { dependsOn: ["a"] } },
      ],
    } as const;
    expect(() => compileApplication(definition, createRegistryBuilder().register(testing.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_RESOURCE_DEPENDENCY_CYCLE" }),
    );
  });
});
