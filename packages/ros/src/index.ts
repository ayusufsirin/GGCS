import { definePlugin, defineType } from "@ggcs/plugin-sdk";
import type { TypeDescriptor, TypeId } from "@ggcs/schema";

export const ROS_PLUGIN_ID = "ggcs:ros" as const;

export type RosMessage = Readonly<Record<string, unknown>>;

/**
 * GGCS portable ROS message definitions use the full ROS 2 interface form
 * package/msg/Type. rosbridge also accepts shorter aliases, but keeping one
 * canonical form prevents semantically identical types from acquiring
 * different GGCS type identities.
 */
export function isCanonicalRosMessageType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z][A-Za-z0-9_]*\/msg\/[A-Za-z][A-Za-z0-9_]*$/.test(value)
  );
}

export function rosMessageTypeId(messageType: string): TypeId {
  if (!isCanonicalRosMessageType(messageType)) {
    throw new Error(
      `ROS message type must use canonical package/msg/Type form: ${messageType}`,
    );
  }
  return `ros:message/${messageType}`;
}

export function defineRosMessageType(
  messageType: string,
): TypeDescriptor<RosMessage> {
  if (!isCanonicalRosMessageType(messageType)) {
    throw new Error(
      `ROS message type must use canonical package/msg/Type form: ${messageType}`,
    );
  }
  return defineType<RosMessage>({
    id: rosMessageTypeId(messageType),
    title: messageType,
    description: `Raw ROS message ${messageType}`,
    schema: {
      type: "object",
      "x-ggcs-domain": "ros",
      "x-ggcs-ros-interface-kind": "message",
      "x-ggcs-ros-interface-type": messageType,
    },
  });
}

export function createRosDomainPlugin(options: {
  readonly messageTypes?: readonly string[];
} = {}) {
  const seen = new Set<string>();
  const types = (options.messageTypes ?? []).map((messageType) => {
    if (seen.has(messageType)) {
      throw new Error(`Duplicate ROS message type registration: ${messageType}`);
    }
    seen.add(messageType);
    return defineRosMessageType(messageType);
  });

  return definePlugin({
    manifest: {
      id: ROS_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    types,
  });
}
