import {
  DERIVED_PROVIDER_ID,
  compileApplication,
  createRegistryBuilder,
  type CompiledRuntimeDefinition,
} from "@ggcs/core";
import { ROS_PLUGIN_ID, createRosDomainPlugin } from "@ggcs/ros";
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
  ROSBRIDGE_PLUGIN_ID,
  ROSBRIDGE_PROVIDER_IDS,
  createRosbridgeTransportPlugin,
} from "@ggcs/transport-rosbridge";

export const LIVE_TOPIC_NAMES = {
  speed: "/speed",
  acceleration: "/accel",
  satellites: "/arnav/satellites",
} as const;

export const LIVE_RESOURCE_IDS = {
  connection: "robot",
  speedRaw: "vehicle.speed.raw",
  accelerationRaw: "vehicle.acceleration.raw",
  satellitesRaw: "arnav.satellites.raw",
  speed: "vehicle.speed",
  acceleration: "vehicle.acceleration",
  satellites: "arnav.satellites",
  parameters: "shadow.parameters",
} as const;

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
      connection: LIVE_RESOURCE_IDS.connection,
      topic: options.topic,
      messageType: options.messageType,
      freshness: { staleAfterMs: 750 },
    },
  };
}

function derived(
  id: string,
  computation: string,
  input: string,
): BaseResourceDefinition {
  return {
    id,
    provider: DERIVED_PROVIDER_ID,
    type: CORE_TYPE_IDS.number,
    config: { computation, inputs: { input } },
  };
}

export function createLiveShadowDefinition(options: {
  readonly rosbridgeUrl: string;
}): ApplicationDefinition {
  const ids = LIVE_RESOURCE_IDS;
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [ROS_PLUGIN_ID, ROSBRIDGE_PLUGIN_ID, ROS_STD_MSGS_PLUGIN_ID],
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
            maxDelayMs: 1_000,
            multiplier: 2,
          },
        },
      },
      topicSource({
        id: ids.speedRaw,
        type: ROS_STD_TYPE_IDS.float64,
        topic: LIVE_TOPIC_NAMES.speed,
        messageType: ROS_STD_MESSAGE_TYPES.float64,
      }),
      topicSource({
        id: ids.accelerationRaw,
        type: ROS_STD_TYPE_IDS.float64,
        topic: LIVE_TOPIC_NAMES.acceleration,
        messageType: ROS_STD_MESSAGE_TYPES.float64,
      }),
      topicSource({
        id: ids.satellitesRaw,
        type: ROS_STD_TYPE_IDS.int64,
        topic: LIVE_TOPIC_NAMES.satellites,
        messageType: ROS_STD_MESSAGE_TYPES.int64,
      }),
      derived(ids.speed, ROS_STD_COMPUTATION_IDS.float64Data, ids.speedRaw),
      derived(
        ids.acceleration,
        ROS_STD_COMPUTATION_IDS.float64Data,
        ids.accelerationRaw,
      ),
      derived(ids.satellites, ROS_STD_COMPUTATION_IDS.int64Data, ids.satellitesRaw),
      {
        id: ids.parameters,
        provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
        type: CORE_TYPE_IDS.object,
        config: { connection: ids.connection, timeoutMs: 15_000 },
      },
    ],
  };
}

export function compileLiveShadowApplication(options: {
  readonly rosbridgeUrl: string;
}): CompiledRuntimeDefinition {
  return compileApplication(
    createLiveShadowDefinition(options),
    createRegistryBuilder()
      .register(
        createRosDomainPlugin({
          messageTypes: [
            ROS_STD_MESSAGE_TYPES.float64,
            ROS_STD_MESSAGE_TYPES.int64,
          ],
        }),
      )
      .register(createRosbridgeTransportPlugin())
      .register(createRosStdMsgsPlugin()),
  );
}
