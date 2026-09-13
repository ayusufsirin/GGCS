import { describe, expect, it } from "vitest";
import { DERIVED_PROVIDER_ID } from "@ggcs/core";
import { ARNAV_INS_MESSAGE_TYPE, ARNAV_INS_TYPE_ID } from "@ggcs/arnav";
import { ROS_STD_MESSAGE_TYPES, ROS_STD_TYPE_IDS } from "@ggcs/ros-std-msgs";
import { ROSBRIDGE_PROVIDER_IDS, type RosbridgeClientFactory } from "@ggcs/transport-rosbridge";
import {
  SENSOR_SUITE_ACCELERATION_TOPIC,
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_RESOURCE_IDS,
  SENSOR_SUITE_SATELLITES_TOPIC,
  SENSOR_SUITE_SPEED_TOPIC,
  compileSensorSuiteShadowApplication,
  createSensorSuiteShadowDefinition,
} from "../src/definition.js";

describe("Sensor Suite shadow definition", () => {
  it("compiles the production-shaped low-bandwidth graph without opening a ROSBridge client", () => {
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

  it("contains exactly one raw Source for each accepted low-bandwidth ROS topic", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const topicSources = definition.resources.filter(
      (resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.topicSource,
    );
    expect(topicSources).toHaveLength(4);
    expect(topicSources).toEqual(expect.arrayContaining([
      {
        id: SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: ARNAV_INS_TYPE_ID,
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          topic: SENSOR_SUITE_ARNAV_TOPIC,
          messageType: ARNAV_INS_MESSAGE_TYPE,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.vehicleSpeedRaw,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: ROS_STD_TYPE_IDS.float64,
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          topic: SENSOR_SUITE_SPEED_TOPIC,
          messageType: ROS_STD_MESSAGE_TYPES.float64,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.vehicleAccelerationRaw,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: ROS_STD_TYPE_IDS.float64,
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          topic: SENSOR_SUITE_ACCELERATION_TOPIC,
          messageType: ROS_STD_MESSAGE_TYPES.float64,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.arnavSatellitesRaw,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: ROS_STD_TYPE_IDS.int64,
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          topic: SENSOR_SUITE_SATELLITES_TOPIC,
          messageType: ROS_STD_MESSAGE_TYPES.int64,
        },
      },
    ]));
  });

  it("keeps every non-raw semantic resource derived", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const rawIds = new Set([
      SENSOR_SUITE_RESOURCE_IDS.connection,
      SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw,
      SENSOR_SUITE_RESOURCE_IDS.vehicleSpeedRaw,
      SENSOR_SUITE_RESOURCE_IDS.vehicleAccelerationRaw,
      SENSOR_SUITE_RESOURCE_IDS.arnavSatellitesRaw,
    ]);
    const semanticResources = definition.resources.filter((resource) => !rawIds.has(resource.id));
    expect(semanticResources).toHaveLength(Object.keys(SENSOR_SUITE_RESOURCE_IDS).length - rawIds.size);
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
