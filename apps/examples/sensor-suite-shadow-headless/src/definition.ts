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
import {
  ROS_PLUGIN_ID,
  createRosDomainPlugin,
  rosServiceTypeId,
} from "@ggcs/ros";
import {
  ROS_STD_COMPUTATION_IDS,
  ROS_STD_MESSAGE_TYPES,
  ROS_STD_MSGS_PLUGIN_ID,
  ROS_STD_TYPE_IDS,
  createRosStdMsgsPlugin,
} from "@ggcs/ros-std-msgs";
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
export const SENSOR_SUITE_SPEED_TOPIC = "/speed" as const;
export const SENSOR_SUITE_ACCELERATION_TOPIC = "/accel" as const;
export const SENSOR_SUITE_SATELLITES_TOPIC = "/arnav/satellites" as const;
export const SENSOR_SUITE_ZED_RGB_TOPIC = "/zed/zed_node/rgb/color/rect/image/compressed" as const;
export const SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage" as const;

export const SENSOR_SUITE_RECORDING_SERVICES = {
  zedStart: "/zed/zed_node/start_svo_rec",
  zedStop: "/zed/zed_node/stop_svo_rec",
  bagStart: "/bag_recorder/start_bag_recording",
  bagStop: "/bag_recorder/stop_bag_recording",
} as const;

export const SENSOR_SUITE_RECORDING_SERVICE_TYPES = {
  zedStart: "zed_msgs/srv/StartSvoRec",
  trigger: "std_srvs/srv/Trigger",
} as const;

export const SENSOR_SUITE_RESOURCE_IDS = {
  connection: "robot",
  arnavInsRaw: "arnav.ins.raw",
  vehicleSpeedRaw: "vehicle.speed.raw",
  vehicleAccelerationRaw: "vehicle.acceleration.raw",
  arnavSatellitesRaw: "arnav.satellites.raw",
  cameraZedRgbRaw: "camera.zed.rgb.raw",
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
  vehicleSpeed: "vehicle.speed",
  vehicleAcceleration: "vehicle.acceleration",
  arnavSatellites: "arnav.satellites",
  healthSystem: "arnav.health.system",
  healthRollPitch: "arnav.health.rollPitch",
  healthYaw: "arnav.health.yaw",
  healthPositionVelocity: "arnav.health.positionVelocity",
  healthMagnetometer: "arnav.health.magnetometer",
  healthGnssFixed: "arnav.health.gnssFixed",
  rtkFixedLegacy: "arnav.display.rtkFixedLegacy",
  zedRecordingStart: "zed.recording.start",
  zedRecordingStop: "zed.recording.stop",
  bagRecordingStart: "bag.recording.start",
  bagRecordingStop: "bag.recording.stop",
  parameters: "shadow.parameters",
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

export function createArnavSemanticResources(rawSourceId: string): readonly BaseResourceDefinition[] {
  const ids = SENSOR_SUITE_RESOURCE_IDS;
  return [
    derived(ids.arnavRollRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.rollRad, rawSourceId),
    derived(ids.arnavPitchRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.pitchRad, rawSourceId),
    derived(ids.arnavYawRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.yawRad, rawSourceId),
    derived(ids.arnavLatitudeRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.latitudeRad, rawSourceId),
    derived(ids.arnavLongitudeRad, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.longitudeRad, rawSourceId),
    derived(ids.navAltitudeM, CORE_TYPE_IDS.number, ARNAV_COMPUTATION_IDS.altitudeM, rawSourceId),
    derived(ids.healthSystem, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthSystem, rawSourceId),
    derived(ids.healthRollPitch, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthRollPitch, rawSourceId),
    derived(ids.healthYaw, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthYaw, rawSourceId),
    derived(ids.healthPositionVelocity, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthPositionVelocity, rawSourceId),
    derived(ids.healthMagnetometer, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthMagnetometer, rawSourceId),
    derived(ids.healthGnssFixed, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthGnssFixed, rawSourceId),
    // Legacy RTK display source truth is status.gnss_fixed. Keep this as an
    // explicit compatibility resource without inventing a separate RTK bit.
    // Both resources still originate from the one shared raw ArNav Source.
    derived(ids.rtkFixedLegacy, CORE_TYPE_IDS.boolean, ARNAV_COMPUTATION_IDS.healthGnssFixed, rawSourceId),
    derived(ids.navRollDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavRollRad),
    derived(ids.navPitchDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavPitchRad),
    derived(ids.navHeadingDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavYawRad),
    derived(ids.navLatitudeDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavLatitudeRad),
    derived(ids.navLongitudeDeg, CORE_TYPE_IDS.number, TRANSFORM_COMPUTATION_IDS.angleRadToDeg, ids.arnavLongitudeRad),
  ];
}

export function createNumericSemanticResources(options: {
  readonly speedRawSourceId: string;
  readonly accelerationRawSourceId: string;
  readonly satellitesRawSourceId: string;
}): readonly BaseResourceDefinition[] {
  const ids = SENSOR_SUITE_RESOURCE_IDS;
  return [
    derived(ids.vehicleSpeed, CORE_TYPE_IDS.number, ROS_STD_COMPUTATION_IDS.float64Data, options.speedRawSourceId),
    derived(ids.vehicleAcceleration, CORE_TYPE_IDS.number, ROS_STD_COMPUTATION_IDS.float64Data, options.accelerationRawSourceId),
    derived(ids.arnavSatellites, CORE_TYPE_IDS.number, ROS_STD_COMPUTATION_IDS.int64Data, options.satellitesRawSourceId),
  ];
}

function topicSource(options: {
  readonly id: string;
  readonly type: string;
  readonly topic: string;
  readonly messageType: string;
}): BaseResourceDefinition {
  return {
    id: options.id,
    provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
    type: options.type,
    config: {
      connection: SENSOR_SUITE_RESOURCE_IDS.connection,
      topic: options.topic,
      messageType: options.messageType,
    },
  };
}

function serviceProcedure(options: {
  readonly id: string;
  readonly service: string;
  readonly serviceType: string;
}): BaseResourceDefinition {
  return {
    id: options.id,
    provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
    type: rosServiceTypeId(options.serviceType),
    config: {
      connection: SENSOR_SUITE_RESOURCE_IDS.connection,
      service: options.service,
      serviceType: options.serviceType,
    },
  };
}

export function createSensorSuiteShadowDefinition(options: {
  readonly rosbridgeUrl: string;
  readonly includeCamera?: boolean;
}): ApplicationDefinition {
  const ids = SENSOR_SUITE_RESOURCE_IDS;
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [
      ROS_PLUGIN_ID,
      ROSBRIDGE_PLUGIN_ID,
      ROS_STD_MSGS_PLUGIN_ID,
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
      topicSource({
        id: ids.arnavInsRaw,
        type: ARNAV_INS_TYPE_ID,
        topic: SENSOR_SUITE_ARNAV_TOPIC,
        messageType: ARNAV_INS_MESSAGE_TYPE,
      }),
      topicSource({
        id: ids.vehicleSpeedRaw,
        type: ROS_STD_TYPE_IDS.float64,
        topic: SENSOR_SUITE_SPEED_TOPIC,
        messageType: ROS_STD_MESSAGE_TYPES.float64,
      }),
      topicSource({
        id: ids.vehicleAccelerationRaw,
        type: ROS_STD_TYPE_IDS.float64,
        topic: SENSOR_SUITE_ACCELERATION_TOPIC,
        messageType: ROS_STD_MESSAGE_TYPES.float64,
      }),
      topicSource({
        id: ids.arnavSatellitesRaw,
        type: ROS_STD_TYPE_IDS.int64,
        topic: SENSOR_SUITE_SATELLITES_TOPIC,
        messageType: ROS_STD_MESSAGE_TYPES.int64,
      }),
      ...(options.includeCamera === true
        ? [topicSource({
            id: ids.cameraZedRgbRaw,
            type: `ros:message/${SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE}`,
            topic: SENSOR_SUITE_ZED_RGB_TOPIC,
            messageType: SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
          })]
        : []),
      ...createArnavSemanticResources(ids.arnavInsRaw),
      ...createNumericSemanticResources({
        speedRawSourceId: ids.vehicleSpeedRaw,
        accelerationRawSourceId: ids.vehicleAccelerationRaw,
        satellitesRawSourceId: ids.arnavSatellitesRaw,
      }),
      // Shadow mode prepares the real production Procedure definitions only.
      // Nothing in this application invokes them. In particular, the legacy
      // module-load SVO filename timestamp behavior remains documented debt and
      // is not silently reinterpreted as invocation-time request construction.
      serviceProcedure({
        id: ids.zedRecordingStart,
        service: SENSOR_SUITE_RECORDING_SERVICES.zedStart,
        serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.zedStart,
      }),
      serviceProcedure({
        id: ids.zedRecordingStop,
        service: SENSOR_SUITE_RECORDING_SERVICES.zedStop,
        serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
      }),
      serviceProcedure({
        id: ids.bagRecordingStart,
        service: SENSOR_SUITE_RECORDING_SERVICES.bagStart,
        serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
      }),
      serviceProcedure({
        id: ids.bagRecordingStop,
        service: SENSOR_SUITE_RECORDING_SERVICES.bagStop,
        serviceType: SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
      }),
      {
        id: ids.parameters,
        provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
        type: CORE_TYPE_IDS.object,
        config: {
          connection: ids.connection,
          timeoutMs: 15_000,
        },
      },
    ],
  };
}

export function createSensorSuiteShadowRegistry(
  transportOptions: RosbridgeTransportPluginOptions = {},
) {
  return createRegistryBuilder()
    .register(createRosDomainPlugin({
      messageTypes: [
        ARNAV_INS_MESSAGE_TYPE,
        ROS_STD_MESSAGE_TYPES.float64,
        ROS_STD_MESSAGE_TYPES.int64,
        SENSOR_SUITE_ZED_RGB_MESSAGE_TYPE,
      ],
      serviceTypes: [
        SENSOR_SUITE_RECORDING_SERVICE_TYPES.zedStart,
        SENSOR_SUITE_RECORDING_SERVICE_TYPES.trigger,
      ],
    }))
    .register(createRosbridgeTransportPlugin(transportOptions))
    .register(createRosStdMsgsPlugin())
    .register(createTransformsPlugin())
    .register(createArnavPlugin());
}

export function compileSensorSuiteShadowApplication(options: {
  readonly rosbridgeUrl: string;
  readonly includeCamera?: boolean;
  readonly transport?: RosbridgeTransportPluginOptions;
}): CompiledRuntimeDefinition {
  return compileApplication(
    createSensorSuiteShadowDefinition({
      rosbridgeUrl: options.rosbridgeUrl,
      ...(options.includeCamera !== undefined ? { includeCamera: options.includeCamera } : {}),
    }),
    createSensorSuiteShadowRegistry(options.transport),
  );
}
