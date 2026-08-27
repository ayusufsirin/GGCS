import { describe, expect, it } from "vitest";
import {
  DERIVED_PROVIDER_ID,
  compileApplication,
  createRegistryBuilder,
  defineValueTransform,
  type ComputationInstance,
  type Observation,
  type Source,
} from "@ggcs/core";
import { definePlugin, defineType } from "@ggcs/plugin-sdk";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import { FakeClock, TEST_PROVIDER_IDS, TestSource, createTestingPlugin } from "../src/index.js";

const doubledType = defineType<number>({ id: "test:type/doubled", schema: { type: "number" } });
const double = defineValueTransform<number, number>({
  id: "test:double",
  input: CORE_TYPE_IDS.number,
  output: doubledType.id,
  transform: (value) => value * 2,
});

describe("DerivedSource/computation", () => {
  it("maps values and propagates stale state", async () => {
    const testing = createTestingPlugin();
    const plugin = definePlugin({
      manifest: { id: "test:derived", version: "0.1.0", ggcsApi: "^0.1.0" },
      types: [doubledType],
      computations: [double],
    });
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", "test:derived"],
      resources: [
        { id: "raw", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { initial: 2, staleAfterMs: 50 } },
        { id: "derived", provider: DERIVED_PROVIDER_ID, type: doubledType.id, config: { computation: double.id, inputs: { input: "raw" } } },
      ],
    }, createRegistryBuilder().register(testing.plugin).register(plugin));
    const clock = new FakeClock();
    const runtime = compiled.createRuntime({ clock });
    await runtime.start();
    const derived = runtime.resource<Source<number>>("derived");
    expect(derived.current()).toMatchObject({ state: "fresh", value: 4 });
    clock.advanceBy(50);
    expect(derived.current()).toMatchObject({ state: "stale", value: 4 });
    await runtime.stop();
  });

  it("allows custom computation to turn unavailable inputs into fresh semantic health", async () => {
    const healthType = defineType<string>({ id: "test:type/health", schema: { type: "string" } });
    const healthComputation = {
      id: "test:health",
      inputs: { input: CORE_TYPE_IDS.number },
      output: healthType.id,
      create(): ComputationInstance<string> {
        return {
          compute({ inputs, clock }): Observation<string> {
            return {
              state: "fresh",
              value: inputs.input?.state === "fresh" ? "ok" : "degraded",
              updatedAt: clock.wallNow(),
            };
          },
        };
      },
    };
    const testing = createTestingPlugin();
    const plugin = definePlugin({
      manifest: { id: "test:health-plugin", version: "0.1.0", ggcsApi: "^0.1.0" },
      types: [healthType],
      computations: [healthComputation],
    });
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", "test:health-plugin"],
      resources: [
        { id: "input", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number },
        { id: "health", provider: DERIVED_PROVIDER_ID, type: healthType.id, config: { computation: healthComputation.id, inputs: { input: "input" } } },
      ],
    }, createRegistryBuilder().register(testing.plugin).register(plugin));
    const runtime = compiled.createRuntime({ clock: new FakeClock() });
    await runtime.start();
    expect(runtime.resource<Source<string>>("health").current()).toMatchObject({ state: "fresh", value: "degraded" });
    await runtime.stop();
  });

  it("creates isolated stateful computation instances", async () => {
    const countType = defineType<number>({ id: "test:type/count", schema: { type: "number" } });
    const counter = {
      id: "test:counter",
      inputs: { input: CORE_TYPE_IDS.number },
      output: countType.id,
      create(): ComputationInstance<number> {
        let count = 0;
        return {
          compute({ clock }): Observation<number> {
            return { state: "fresh", value: ++count, updatedAt: clock.wallNow() };
          },
        };
      },
    };
    const testing = createTestingPlugin();
    const plugin = definePlugin({
      manifest: { id: "test:counter-plugin", version: "0.1.0", ggcsApi: "^0.1.0" },
      types: [countType],
      computations: [counter],
    });
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", "test:counter-plugin"],
      resources: [
        { id: "input", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { initial: 1 } },
        { id: "a", provider: DERIVED_PROVIDER_ID, type: countType.id, config: { computation: counter.id, inputs: { input: "input" } } },
        { id: "b", provider: DERIVED_PROVIDER_ID, type: countType.id, config: { computation: counter.id, inputs: { input: "input" } } },
      ],
    }, createRegistryBuilder().register(testing.plugin).register(plugin));
    const runtime = compiled.createRuntime({ clock: new FakeClock() });
    await runtime.start();
    expect(runtime.resource<Source<number>>("a").current()).toMatchObject({ value: 1 });
    expect(runtime.resource<Source<number>>("b").current()).toMatchObject({ value: 1 });
    runtime.resource<TestSource<number>>("input").emit(2);
    expect(runtime.resource<Source<number>>("a").current()).toMatchObject({ value: 2 });
    expect(runtime.resource<Source<number>>("b").current()).toMatchObject({ value: 2 });
    await runtime.stop();
  });
});
