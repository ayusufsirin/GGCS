import { describe, expect, it } from "vitest";
import {
  DERIVED_PROVIDER_ID,
  RuntimeError,
  compileApplication,
  createRegistryBuilder,
  defineValueTransform,
} from "@ggcs/core";
import { definePlugin, defineType } from "@ggcs/plugin-sdk";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import { TEST_PROVIDER_IDS, createTestingPlugin } from "../src/index.js";

describe("Registry/schema/type validation", () => {
  it("rejects incompatible GGCS API versions and missing/cyclic plugin dependencies", () => {
    const incompatible = definePlugin({ manifest: { id: "p:bad", version: "1.0.0", ggcsApi: "^1.0.0" } });
    expect(() => createRegistryBuilder().register(incompatible).freeze()).toThrowError(
      expect.objectContaining({ code: "GGCS_PLUGIN_API_VERSION" }),
    );

    const missing = definePlugin({ manifest: { id: "p:a", version: "1.0.0", ggcsApi: "^0.1.0", requires: [{ id: "p:missing", version: "^1.0.0" }] } });
    expect(() => createRegistryBuilder().register(missing).freeze()).toThrowError(
      expect.objectContaining({ code: "GGCS_PLUGIN_DEPENDENCY_MISSING" }),
    );

    const a = definePlugin({ manifest: { id: "p:a", version: "1.0.0", ggcsApi: "^0.1.0", requires: [{ id: "p:b", version: "^1.0.0" }] } });
    const b = definePlugin({ manifest: { id: "p:b", version: "1.0.0", ggcsApi: "^0.1.0", requires: [{ id: "p:a", version: "^1.0.0" }] } });
    expect(() => createRegistryBuilder().register(a).register(b).freeze()).toThrowError(
      expect.objectContaining({ code: "GGCS_PLUGIN_DEPENDENCY_CYCLE" }),
    );
  });

  it("rejects duplicate registrations and freezes after compilation", () => {
    const t1 = defineType<number>({ id: "p:type/x", schema: { type: "number" } });
    const t2 = defineType<number>({ id: "p:type/x", schema: { type: "number" } });
    const a = definePlugin({ manifest: { id: "p:a", version: "0.1.0", ggcsApi: "^0.1.0" }, types: [t1] });
    const b = definePlugin({ manifest: { id: "p:b", version: "0.1.0", ggcsApi: "^0.1.0" }, types: [t2] });
    expect(() => createRegistryBuilder().register(a).register(b).freeze()).toThrowError(
      expect.objectContaining({ code: "GGCS_TYPE_DUPLICATE" }),
    );

    const testing = createTestingPlugin();
    const builder = createRegistryBuilder().register(testing.plugin);
    compileApplication({ schemaVersion: GGCS_SCHEMA_VERSION, plugins: ["testing:plugin"], resources: [] }, builder);
    expect(() => builder.register(a)).toThrowError(expect.objectContaining({ code: "GGCS_REGISTRY_FROZEN" }));
  });

  it("uses conservative semantic compatibility and explicit transforms", () => {
    const radians = defineType<number>({ id: "units:radians", schema: { type: "number" } });
    const degrees = defineType<number>({ id: "units:degrees", schema: { type: "number" } });
    const transform = defineValueTransform<number, number>({
      id: "units:rad-to-deg",
      input: radians.id,
      output: degrees.id,
      transform: (value) => value * 180 / Math.PI,
    });
    const testing = createTestingPlugin();
    const units = definePlugin({
      manifest: { id: "units:plugin", version: "0.1.0", ggcsApi: "^0.1.0" },
      types: [radians, degrees],
      computations: [transform],
    });
    const frozen = createRegistryBuilder().register(testing.plugin).register(units).freeze();
    expect(frozen.isTypeCompatible(radians.id, degrees.id)).toBe(false);

    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin", "units:plugin"],
      resources: [
        { id: "angle.raw", provider: TEST_PROVIDER_IDS.source, type: radians.id, config: { initial: Math.PI } },
        { id: "angle.deg", provider: DERIVED_PROVIDER_ID, type: degrees.id, config: { computation: transform.id, inputs: { input: "angle.raw" } } },
      ],
    }, frozen);
    expect(compiled.orderedResources.map((resource) => resource.id)).toEqual(["angle.raw", "angle.deg"]);
  });

  it("rejects unsupported schema versions, unknown providers, and unknown strict config fields", () => {
    const testing = createTestingPlugin();
    expect(() => compileApplication({ schemaVersion: "99", resources: [] }, createRegistryBuilder().register(testing.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_SCHEMA_VERSION_UNSUPPORTED" }),
    );

    const testing2 = createTestingPlugin();
    expect(() => compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      resources: [{ id: "x", provider: "missing:provider", type: CORE_TYPE_IDS.number }],
    }, createRegistryBuilder().register(testing2.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_PROVIDER_UNKNOWN" }),
    );

    const testing3 = createTestingPlugin();
    expect(() => compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      resources: [{ id: "x", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, config: { typo: true } }],
    }, createRegistryBuilder().register(testing3.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_CONFIG_FIELD_UNKNOWN" }),
    );

    const testing4 = createTestingPlugin();
    expect(() => compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      resources: [],
      typo: true,
    } as any, createRegistryBuilder().register(testing4.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_APPLICATION_FIELD_UNKNOWN" }),
    );

    const testing5 = createTestingPlugin();
    expect(() => compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      resources: [{ id: "x", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.number, typo: true }],
    } as any, createRegistryBuilder().register(testing5.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_RESOURCE_FIELD_UNKNOWN" }),
    );
  });

  it("rejects plugin dependency version mismatches and unknown semantic types", () => {
    const dependency = definePlugin({
      manifest: { id: "p:dependency", version: "1.5.0", ggcsApi: "^0.1.0" },
    });
    const consumer = definePlugin({
      manifest: {
        id: "p:consumer",
        version: "1.0.0",
        ggcsApi: "^0.1.0",
        requires: [{ id: "p:dependency", version: "^2.0.0" }],
      },
    });
    expect(() => createRegistryBuilder().register(dependency).register(consumer).freeze()).toThrowError(
      expect.objectContaining({ code: "GGCS_PLUGIN_DEPENDENCY_VERSION" }),
    );

    const testing = createTestingPlugin();
    expect(() => compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin"],
      resources: [{ id: "x", provider: TEST_PROVIDER_IDS.source, type: "missing:type" }],
    }, createRegistryBuilder().register(testing.plugin))).toThrowError(
      expect.objectContaining({ code: "GGCS_TYPE_UNKNOWN" }),
    );
  });

});
