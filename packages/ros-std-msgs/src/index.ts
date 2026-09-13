import { definePlugin, defineValueTransform } from "@ggcs/plugin-sdk";
import { rosMessageTypeId, type RosMessage } from "@ggcs/ros";
import { CORE_TYPE_IDS } from "@ggcs/schema";

export const ROS_STD_MSGS_PLUGIN_ID = "ggcs:ros-std-msgs" as const;

export const ROS_STD_MESSAGE_TYPES = {
  float64: "std_msgs/msg/Float64",
  int64: "std_msgs/msg/Int64",
} as const;

export const ROS_STD_TYPE_IDS = {
  float64: rosMessageTypeId(ROS_STD_MESSAGE_TYPES.float64),
  int64: rosMessageTypeId(ROS_STD_MESSAGE_TYPES.int64),
} as const;

export const ROS_STD_COMPUTATION_IDS = {
  float64Data: "ros.std_msgs.float64.data",
  int64Data: "ros.std_msgs.int64.data",
} as const;

function requireFiniteData(message: RosMessage, messageType: string): number {
  const value = message.data;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${messageType} field data must be a finite number`);
  }
  return value;
}

export function projectFloat64Data(message: RosMessage): number {
  return requireFiniteData(message, ROS_STD_MESSAGE_TYPES.float64);
}

export function projectInt64Data(message: RosMessage): number {
  return requireFiniteData(message, ROS_STD_MESSAGE_TYPES.int64);
}

export const float64Data = defineValueTransform<RosMessage, number>({
  id: ROS_STD_COMPUTATION_IDS.float64Data,
  input: ROS_STD_TYPE_IDS.float64,
  output: CORE_TYPE_IDS.number,
  transform: projectFloat64Data,
});

export const int64Data = defineValueTransform<RosMessage, number>({
  id: ROS_STD_COMPUTATION_IDS.int64Data,
  input: ROS_STD_TYPE_IDS.int64,
  output: CORE_TYPE_IDS.number,
  transform: projectInt64Data,
});

export function createRosStdMsgsPlugin() {
  return definePlugin({
    manifest: {
      id: ROS_STD_MSGS_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
      requires: [{ id: "ggcs:ros", version: "^0.1.0" }],
    },
    computations: [float64Data, int64Data],
  });
}
