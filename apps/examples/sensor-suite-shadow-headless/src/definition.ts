import {
  DERIVED_PROVIDER_ID,
  compileApplication,
  createRegistryBuilder,
  type CompiledRuntimeDefinition,
} from "@ggcs/core";
import {
  ARNAV_COMPUTATION_IDS,
  ARNAV_INS_MESSAGE_TYPE,
  ARNAV_INS_TYPE_ID,
  ARNAV_PLUGIN_ID,
  createArnavPlugin,
} from "@ggcs/arnav";
import { ROS_PLUGIN_ID, createRosDomainPlugin } from "@ggcs/ros";
import {
  CORE_TYPE_IDS,
  GGCS_SCHEMA_VERSION,
  type ApplicationDefinition,
  type BaseResourceDefinition,
} from "@ggcs/schema";
import {
  TRANSFORM_COMPUTATION_IDS,
  TRANSFORMS_PLUGIN_ID,
  createTransformsPlugin,
} from "@ggcs/transforms";
import {
  ROSBRIDGE_PLUGIN_ID,
  ROSBRIDGE_PROVIDER_IDS,
  createRosbridgeTransportPlugin,
  type RosbridgeTransportPluginOptions,
} from "@ggcs/transport-rosbridge";

export const SENSOR_SUITE_ARNAV_TOPIC = "/ArdicLabs/Arnav/Gnss_Ins_data" as const;

export const SENSOR_SUITE_RESOURCE_IDS = {
  connection: "robot",
  arnavInsRaw: "arnav.ins.raw",
  arnavRollRad: "arnav.roll.rad",
  arnavPitchRad: "arnav.pitch.rad",
  arnavYawRad: "arnav.yaw.rad",
  arnavLatitudeRad: "arnav.latitude.rad",
  arnavLongitudeRad: "arnav.longitude.rad",
  navRollDeg: "nav.roll.deg",
  navPitchDeg: "nav.pitch.deg",
  navHeadingDeg: "nav.heading.deg",
  navLatitudeDeg: "nav.latitude.deg",
  navLongitudeDeg: "nav.longitude.deg",
  navAltitudeM: "nav.altitude.m",
  healthSystem: "arnav.health.system",
  healthRollPitch: "arnav.health.rollPitch",
  healthYaw: "arnav.health.yaw",
  healthPositionVelocity: "arnav.health.positionVelocity",
  healthMagnetometer: "arnav.health.magnetometer",
  healthGnssFixed: "arnav.health.gnssFixed",
} as const;

function derived(
  id: string,
  type: string,
  computation: string,
  input: string,
): BaseResourceDefinition {
  return {
    id,
    provider: DERIVED_PROVIDER_ID,
    type,
    config: {
      computation,
      inputs: { input },
    },
  };
}

export function createSensorSuiteShadowDefinition(options: {
  readonly rosbridgeUrl: string;
}): ApplicationDefinition {
  const ids = SENSOR_SUITE_RESOURCE_IDS;
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [
      ROS_PLUGIN_ID,
      ROSBRIDGE_PLUGIN_ID,
      TRANSFORMS_PLUGIN_ID,
      ARNAV_PLUGIN_ID,
    ],
    resources: [
      {
        id: ids.connection,
        provider: ROSBRIDGE_PROVIDER_IDS.connection,
        type: CORE_TYPE_IDS.object,
        config: {
          url: options.rosbridgeUrl,
          reconnect: {
            enabled: true,
            initialDelayMs: 250,
            maxDelayMs: 2_000,
            multiplier: 2,
          },
        },
      },
      {
        id: ids.arnavInsRaw,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: ARNAV_INS_TYPE_ID,
        config: {
          connection: ids.connection,
          topic: SENSOR_SUITE_ARNAV_TOPIC,
          messageType: ARNAV_INS_MESSAGE_TYPE,
        },
      },
      derived(ids.arnavRollRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.rollRad, ids.arnavInsRaw),
      derived(ids.arnavPitchRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.pitchRad, ids.arnavInsRaw),
      derived(ids.arnavYawRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.yawRad, ids.arnavInsRaw),
      derived(ids.arnavLatitudeRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.latitudeRad, ids.arnavInsRaw),
      derived(ids.arnavLongitudeRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.longitudeRad, ids.arnavInsRaw),
      derived(ids.navAltitudeM, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.altitudeM, ids.arnavInsRaw),
      derived(ids.healthSystem, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthSystem, ids.arnavInsRaw),
      derived(ids.healthRollPitch, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthRollPitch, ids.arnavInsRaw),
      derived(ids.healthYaw, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthYaw, ids.arnavInsRaw),
      derived(ids.healthPositionVelocity, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthPositionVelocity, ids.arnavInsRaw),
      derived(ids.healthMagnetometer, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthMagnetometer, ids.arnavInsRaw),
      derived(ids.healthGnssFixed, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthGnssFixed, ids.arnavInsRaw),
      derived(ids.navRollDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavRollRad),
      derived(ids.navPitchDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavPitchRad),
      derived(ids.navHeadingDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavYawRad),
      derived(ids.navLatitudeDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavLatitudeRad),
      derived(ids.navLongitudeDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavLongitudeRad),
    ],
  };
}

export function createSensorSuiteShadowRegistry(
  transportOptions: RosbridgeTransportPluginOptions = {},
) {
  return createRegistryBuilder()
    .register(createRosDomainPlugin({ messageTypes: [ARNAV_INS_MESSAGE_TYPE] }))
    .register(createRosbridgeTransportPlugin(transportOptions))
    .register(createTransformsPlugin())
    .register(createArnavPlugin());
}

export function compileSensorSuiteShadowApplication(options: {
  readonly rosbridgeUrl: string;
  readonly transport?: RosbridgeTransportPluginOptions;
}): CompiledRuntimeDefinition {
  return compileApplication(
    createSensorSuiteShadowDefinition({ rosbridgeUrl: options.rosbridgeUrl }),
    createSensorSuiteShadowRegistry(options.transport),
  );
}
