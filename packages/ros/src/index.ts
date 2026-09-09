import { definePlugin, defineType } from "@ggcs/plugin-sdk";
import type { TypeDescriptor, TypeId } from "@ggcs/schema";

export const ROS_PLUGIN_ID = "ggcs:ros" as const;

export type RosMessage = Readonly<Record<string, unknown>>;
export type RosServiceRequest = Readonly<Record<string, unknown>>;
export type RosServiceResponse = Readonly<Record<string, unknown>>;

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

/** Canonical ROS 2 service identity uses package/srv/Type. */
export function isCanonicalRosServiceType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z][A-Za-z0-9_]*\/srv\/[A-Za-z][A-Za-z0-9_]*$/.test(value)
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

export function rosServiceTypeId(serviceType: string): TypeId {
  if (!isCanonicalRosServiceType(serviceType)) {
    throw new Error(
      `ROS service type must use canonical package/srv/Type form: ${serviceType}`,
    );
  }
  return `ros:service/${serviceType}`;
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

export function defineRosServiceType(
  serviceType: string,
): TypeDescriptor<{
  readonly request: RosServiceRequest;
  readonly response: RosServiceResponse;
}> {
  if (!isCanonicalRosServiceType(serviceType)) {
    throw new Error(
      `ROS service type must use canonical package/srv/Type form: ${serviceType}`,
    );
  }
  return defineType({
    id: rosServiceTypeId(serviceType),
    title: serviceType,
    description: `Raw ROS service ${serviceType}`,
    schema: {
      type: "object",
      "x-ggcs-domain": "ros",
      "x-ggcs-ros-interface-kind": "service",
      "x-ggcs-ros-interface-type": serviceType,
    },
  });
}

export function createRosDomainPlugin(options: {
  readonly messageTypes?: readonly string[];
  readonly serviceTypes?: readonly string[];
} = {}) {
  const seenMessageTypes = new Set<string>();
  const messageTypes = (options.messageTypes ?? []).map((messageType) => {
    if (seenMessageTypes.has(messageType)) {
      throw new Error(`Duplicate ROS message type registration: ${messageType}`);
    }
    seenMessageTypes.add(messageType);
    return defineRosMessageType(messageType);
  });

  const seenServiceTypes = new Set<string>();
  const serviceTypes = (options.serviceTypes ?? []).map((serviceType) => {
    if (seenServiceTypes.has(serviceType)) {
      throw new Error(`Duplicate ROS service type registration: ${serviceType}`);
    }
    seenServiceTypes.add(serviceType);
    return defineRosServiceType(serviceType);
  });

  return definePlugin({
    manifest: {
      id: ROS_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    types: [...messageTypes, ...serviceTypes],
  });
}
