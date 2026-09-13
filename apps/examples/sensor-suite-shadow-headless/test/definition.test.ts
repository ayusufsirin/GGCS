import { describe, expect, it } from "vitest";
import { DERIVED_PROVIDER_ID } from "@ggcs/core";
import { ARNAV_COMPUTATION_IDS, ARNAV_INS_MESSAGE_TYPE, ARNAV_INS_TYPE_ID } from "@ggcs/arnav";
import { rosServiceTypeId } from "@ggcs/ros";
import { ROS_STD_MESSAGE_TYPES, ROS_STD_TYPE_IDS } from "@ggcs/ros-std-msgs";
import { ROSBRIDGE_PROVIDER_IDS, type RosbridgeClientFactory } from "@ggcs/transport-rosbridge";
import {
  SENSOR_SUITE_ACCELERATION_TOPIC,
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_RECORDING_SERVICES,
  SENSOR_SUITE_RECORDING_SERVICE_TYPES,
  SENSOR_SUITE_RESOURCE_IDS,
  SENSOR_SUITE_SATELLITES_TOPIC,
  SENSOR_SUITE_SPEED_TOPIC,
  SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
  SENSOR_SUITE_ZED_RGB_TOPIC,
  compileSensorSuiteShadowApplication,
  createSensorSuiteShadowDefinition,
} from "../src/definition.js";

describe("Sensor Suite shadow definition", () => {
  it("compiles the production-shaped graph without opening a ROSBridge client", () => {
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
    expect(compiled.orderedResources).toHaveLength(
      createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" }).resources.length,
    );
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

  it("keeps camera traffic disabled by default and exposes an explicit opt-in raw Source", () => {
    const baseline = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    expect(baseline.resources.some((resource) => resource.id === SENSOR_SUITE_RESOURCE_IDS.cameraZedRgbRaw)).toBe(false);
    const withCamera = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090", includeCamera: true });
    expect(withCamera.resources.find((resource) => resource.id === SENSOR_SUITE_RESOURCE_IDS.cameraZedRgbRaw)).toEqual({
      id: SENSOR_SUITE_RESOURCE_IDS.cameraZedRgbRaw,
      provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
      type: `ros:message/${SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE}`,
      config: {
        connection: SENSOR_SUITE_RESOURCE_IDS.connection,
        topic: SENSOR_SUITE_ZED_RGB_TOPIC,
        messageType: SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
      },
    });
  });

  it("maps the legacy RTK display explicitly to the existing gnss_fixed semantic truth", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const health = definition.resources.find((resource) => resource.id === SENSOR_SUITE_RESOURCE_IDS.healthGnssFixed);
    const legacyAlias = definition.resources.find((resource) => resource.id === SENSOR_SUITE_RESOURCE_IDS.rtkFixedLegacy);
    expect(health).toMatchObject({
      provider: DERIVED_PROVIDER_ID,
      config: {
        computation: ARNAV_COMPUTATION_IDS.healthGnssFixed,
        inputs: { input: SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw },
      },
    });
    expect(legacyAlias).toMatchObject({
      provider: DERIVED_PROVIDER_ID,
      config: {
        computation: ARNAV_COMPUTATION_IDS.healthGnssFixed,
        inputs: { input: SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw },
      },
    });
  });

  it("keeps non-operational semantic resources derived", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const excludedIds = new Set<string>([
      SENSOR_SUITE_RESOURCE_IDS.connection,
      SENSOR_SUITE_RESOURCE_IDS.arnavInsRaw,
      SENSOR_SUITE_RESOURCE_IDS.vehicleSpeedRaw,
      SENSOR_SUITE_RESOURCE_IDS.vehicleAccelerationRaw,
      SENSOR_SUITE_RESOURCE_IDS.arnavSatellitesRaw,
      SENSOR_SUITE_RESOURCE_IDS.cameraZedRgbRaw,
      SENSOR_SUITE_RESOURCE_IDS.zedRecordingStart,
      SENSOR_SUITE_RESOURCE_IDS.zedRecordingStop,
      SENSOR_SUITE_RESOURCE_IDS.bagRecordingStart,
      SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop,
      SENSOR_SUITE_RESOURCE_IDS.parameters,
    ]);
    const semanticResources = definition.resources.filter((resource) => !excludedIds.has(resource.id));
    for (const resource of semanticResources) {
      expect(resource.provider).toBe(DERIVED_PROVIDER_ID);
    }
  });

  it("defines all production recording Procedures without invoking them", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    const procedures = definition.resources.filter(
      (resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
    );
    expect(procedures).toHaveLength(4);
    expect(procedures).toEqual(expect.arrayContaining([
      {
        id: SENSOR_SUITE_RESOURCE_IDS.zedRecordingStart,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(SENSOR_SUITE_RECORDING_SERVICE_TYPES.zedStart),
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          service: SENSOR_SUITE_RECORDING_SERVICES.zedStart,
          serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.zedStart,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.zedRecordingStop,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger),
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          service: SENSOR_SUITE_RECORDING_SERVICES.zedStop,
          serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.bagRecordingStart,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger),
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          service: SENSOR_SUITE_RECORDING_SERVICES.bagStart,
          serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
        },
      },
      {
        id: SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger),
        config: {
          connection: SENSOR_SUITE_RESOURCE_IDS.connection,
          service: SENSOR_SUITE_RECORDING_SERVICES.bagStop,
          serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
        },
      },
    ]));
  });

  it("contains a read-only-use ParameterProvider definition and no production shadow Command", () => {
    const definition = createSensorSuiteShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9090" });
    expect(definition.resources.some((resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.topicCommand)).toBe(false);
    expect(definition.resources.find((resource) => resource.id === SENSOR_SUITE_RESOURCE_IDS.parameters)).toEqual({
      id: SENSOR_SUITE_RESOURCE_IDS.parameters,
      provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
      type: "ggcs:type/object",
      config: { connection: SENSOR_SUITE_RESOURCE_IDS.connection, timeoutMs: 15_000 },
    });
  });
});
