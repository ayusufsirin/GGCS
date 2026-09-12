import { describe, expect, it } from "vitest";
import { DERIVED_PROVIDER_ID } from "@ggcs/core";
import { ARNAV_INS_MESSAGE_TYPE, ARNAV_INS_TYPE_ID } from "@ggcs/arnav";
import { ROSBRIDGE_PROVIDER_IDS, type RosbridgeClientFactory } from "@ggcs/transport-rosbridge";
import {
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_RESOURCE_IDS,
  compileSensorSuiteShadowApplication,
  createSensorSuiteShadowDefinition,
} from "../src/definition.js";

describe("Sensor Suite shadow definition", () => {
  it("compiles the production-shaped ArNav graph without opening a ROSBridge client", () => {
    let createCalls = 0;
    const clientFactory: RosbridgeClientFactory = {
      create() {
        createCalls += 1;
        throw new Error("compile-only test must not create a transport client");
      },
    };
    const compiled = compileSensorSuiteShadowApplication({
      rosbridgeUrl: "ws://shadow.invalid:9090",
      transport: { clientFactory },
    });
    expect(createCalls).toBe(0);
    expect(compiled.orderedResources).toHaveLength(Object.keys(SENSOR_SUITE_RESOURCE_IDS).length);
  });

  it("contains exactly one raw ArNav ROS topic Source with deployment literals kept in the app", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const topicSources = definition.resources.filter(
      (resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.topicSource,
    );
    expect(topicSources).toHaveLength(1);
    expect(topicSources[0]).toEqual({
      id: SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw,
      provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
      type: ARNAV_INS_TYPE_ID,
      config: {
        connection: SENSOR_SUITE_RESOURCE_IDS.connection,
        topic: SENSOR_SUITE_ARNAV_TOPIC,
        messageType: ARNAV_INS_MESSAGE_TYPE,
      },
    });
  });

  it("keeps every semantic projection derived from the single raw INS source", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const semanticResources = definition.resources.filter(
      (resource) => resource.id !== SENSOR_SUITE_RESOURCE_IDS.connection && resource.id !== SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw,
    );
    expect(semanticResources).toHaveLength(Object.keys(SENSOR_SUITE_RESOURCE_IDS).length - 2);
    for (const resource of semanticResources) {
      expect(resource.provider).toBe(DERIVED_PROVIDER_ID);
    }
  });

  it("contains no shadow command, procedure, or parameter-write resource", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const forbiddenProviders = new Set([
      ROSBRIDGE_PROVIDER_IDS.topicCommand,
      ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
      ROSBRIDGE_PROVIDER_IDS.parameterProvider,
    ]);
    expect(definition.resources.some((resource) => forbiddenProviders.has(resource.provider as never))).toBe(false);
  });
});
