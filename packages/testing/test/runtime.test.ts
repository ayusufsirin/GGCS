import { describe, expect, it } from "vitest";
import {
  RuntimeError,
  compileApplication,
  createRegistryBuilder,
  type ResourceProvider,
} from "@ggcs/core";
import { definePlugin } from "@ggcs/plugin-sdk";
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

  it("cleans already-created resources when a later provider fails during start", async () => {
    const testing = createTestingPlugin();
    const failingProvider: ResourceProvider<{}> = {
      id: "test:failing-provider",
      prepare(definition) {
        return {
          id: definition.id,
          provider: "test:failing-provider",
          type: definition.type,
          dependencies: ["a"],
          prepared: {},
        };
      },
      create() {
        throw new RuntimeError({
          code: "TEST_CREATE_FAILED",
          category: "provider_create",
          message: "intentional create failure",
        });
      },
    };
    const failingPlugin = definePlugin({
      manifest: { id: "test:failing-plugin", version: "0.1.0", ggcsApi: "^0.1.0" },
      resourceProviders: [failingProvider],
    });
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", "test:failing-plugin"],
      resources: [
        { id: "a", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { initial: 1 } },
        { id: "b", provider: failingProvider.id, type: CORE_TYPE_IDS.number },
      ],
    }, createRegistryBuilder().register(testing.plugin).register(failingPlugin));
    const runtime = compiled.createRuntime({ clock: new FakeClock() });
    await expect(runtime.start()).rejects.toMatchObject({ code: "TEST_CREATE_FAILED" });
    expect(runtime.state()).toBe("error");
    expect(testing.events.filter((event) => event.phase === "dispose").map((event) => event.resourceId)).toEqual(["a"]);
    expect(() => runtime.resource("a")).toThrowError(
      expect.objectContaining({ code: "GGCS_RUNTIME_RESOURCE_UNAVAILABLE" }),
    );
    await runtime.stop();
    expect(runtime.state()).toBe("stopped");
  });

  it("does not create any live resources when provider preparation fails", () => {
    const testing = createTestingPlugin();
    const compiledDefinition = {
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin"],
      resources: [
        { id: "good", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { initial: 1 } },
        { id: "bad", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { typo: true } },
      ],
    } as const;

    expect(() => compileApplication(compiledDefinition, createRegistryBuilder().register(testing.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_CONFIG_FIELD_UNKNOWN" }),
    );
    expect(testing.events.filter((event) => event.phase === "prepare").map((event) => event.resourceId)).toEqual(["good"]);
    expect(testing.events.filter((event) => event.phase === "create")).toHaveLength(0);
  });

});
