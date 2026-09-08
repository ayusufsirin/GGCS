import {
  RuntimeError,
  createSourceController,
  type Command,
  type CommandDispatchReceipt,
  type StaleObservation,
  type LiveResource,
  type ResourceProvider,
  type SourceController,
} from "@ggcs/core";
import { definePlugin } from "@ggcs/plugin-sdk";
import {
  isCanonicalRosMessageType,
  rosMessageTypeId,
  type RosMessage,
} from "@ggcs/ros";
import type { BaseResourceDefinition, ResourceId } from "@ggcs/schema";
import {
  defaultRosbridgeClientFactory,
  type RosbridgeClientFactory,
  type RosbridgeTopicOptions,
} from "./client.js";
import {
  RosbridgeConnection,
  type RosbridgeReconnectPolicy,
} from "./connection.js";

export const ROSBRIDGE_PLUGIN_ID = "ggcs:transport-rosbridge" as const;

export const ROSBRIDGE_PROVIDER_IDS = {
  connection: "rosbridge:connection",
  topicSource: "rosbridge:topic-source",
  topicCommand: "rosbridge:topic-command",
} as const;

export interface PreparedRosbridgeConnection {
  readonly url: string;
  readonly reconnect: RosbridgeReconnectPolicy;
}

export interface RosbridgeSubscriptionOptions {
  readonly compression?: string;
  readonly throttleRateMs?: number;
  readonly queueLength?: number;
}

export interface PreparedRosbridgeTopicSource {
  readonly connection: ResourceId;
  readonly topic: string;
  readonly messageType: string;
  readonly subscription: RosbridgeSubscriptionOptions;
  readonly staleAfterMs?: number;
}

export interface RosbridgePublishOptions {
  readonly queueSize?: number;
  readonly latch?: boolean;
}

export interface PreparedRosbridgeTopicCommand {
  readonly connection: ResourceId;
  readonly topic: string;
  readonly messageType: string;
  readonly publish: RosbridgePublishOptions;
}

export interface RosbridgeTransportPluginOptions {
  readonly clientFactory?: RosbridgeClientFactory;
}

const DEFAULT_RECONNECT: RosbridgeReconnectPolicy = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  multiplier: 2,
};

function invalidConnection(message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new RuntimeError({
    code: "GGCS_ROSBRIDGE_CONNECTION_CONFIG_INVALID",
    category: "configuration",
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

function invalidTopicSource(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RuntimeError({
    code: "GGCS_ROSBRIDGE_TOPIC_SOURCE_CONFIG_INVALID",
    category: "configuration",
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

function invalidTopicCommand(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RuntimeError({
    code: "GGCS_ROSBRIDGE_TOPIC_COMMAND_CONFIG_INVALID",
    category: "configuration",
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

function requireNonNegativeFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalidConnection(`ROSBridge reconnect.${field} must be a non-negative finite number`, {
      field,
      value,
    });
  }
  return value;
}

function parseReconnect(value: unknown): RosbridgeReconnectPolicy {
  if (value === undefined) return DEFAULT_RECONNECT;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidConnection("ROSBridge reconnect must be an object");
  }

  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(["enabled", "initialDelayMs", "maxDelayMs", "multiplier"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      invalidConnection(`ROSBridge reconnect has unknown field ${key}`, { field: key });
    }
  }

  const enabled = record.enabled === undefined ? true : record.enabled;
  if (typeof enabled !== "boolean") {
    invalidConnection("ROSBridge reconnect.enabled must be boolean");
  }
  const initialDelayMs =
    record.initialDelayMs === undefined
      ? DEFAULT_RECONNECT.initialDelayMs
      : requireNonNegativeFinite(record.initialDelayMs, "initialDelayMs");
  const maxDelayMs =
    record.maxDelayMs === undefined
      ? DEFAULT_RECONNECT.maxDelayMs
      : requireNonNegativeFinite(record.maxDelayMs, "maxDelayMs");
  const multiplier =
    record.multiplier === undefined
      ? DEFAULT_RECONNECT.multiplier
      : requireNonNegativeFinite(record.multiplier, "multiplier");

  if (multiplier < 1) {
    invalidConnection("ROSBridge reconnect.multiplier must be >= 1", { multiplier });
  }
  if (maxDelayMs < initialDelayMs) {
    invalidConnection("ROSBridge reconnect.maxDelayMs must be >= initialDelayMs", {
      initialDelayMs,
      maxDelayMs,
    });
  }

  return { enabled, initialDelayMs, maxDelayMs, multiplier };
}

function parseConnectionDefinition(
  definition: BaseResourceDefinition,
  config: Readonly<Record<string, unknown>>,
): PreparedRosbridgeConnection {
  if (typeof config.url !== "string" || !/^wss?:\/\/[^\s]+$/i.test(config.url)) {
    invalidConnection(`Resource ${definition.id} requires an explicit ws:// or wss:// ROSBridge url`, {
      resource: definition.id,
      url: config.url,
    });
  }
  return {
    url: config.url,
    reconnect: parseReconnect(config.reconnect),
  };
}

function parseNonNegativeInteger(
  value: unknown,
  field: string,
): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    invalidTopicSource(`ROSBridge topic subscription.${field} must be a non-negative integer`, {
      field,
      value,
    });
  }
  return value as number;
}

function parseCommandNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    invalidTopicCommand(`ROSBridge topic publish.${field} must be a non-negative integer`, {
      field,
      value,
    });
  }
  return value as number;
}

function parseSubscription(value: unknown): RosbridgeSubscriptionOptions {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidTopicSource("ROSBridge topic subscription must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(["compression", "throttleRateMs", "queueLength"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      invalidTopicSource(`ROSBridge topic subscription has unknown field ${key}`, { field: key });
    }
  }

  let compression: string | undefined;
  if (record.compression !== undefined) {
    if (typeof record.compression !== "string" || record.compression.trim().length === 0) {
      invalidTopicSource("ROSBridge topic subscription.compression must be a non-empty string");
    }
    compression = record.compression;
  }

  return {
    ...(compression !== undefined ? { compression } : {}),
    ...(record.throttleRateMs !== undefined
      ? { throttleRateMs: parseNonNegativeInteger(record.throttleRateMs, "throttleRateMs") }
      : {}),
    ...(record.queueLength !== undefined
      ? { queueLength: parseNonNegativeInteger(record.queueLength, "queueLength") }
      : {}),
  };
}

function parseFreshness(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidTopicSource("ROSBridge topic freshness must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(["staleAfterMs"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      invalidTopicSource(`ROSBridge topic freshness has unknown field ${key}`, { field: key });
    }
  }
  if (record.staleAfterMs === undefined) return undefined;
  if (
    typeof record.staleAfterMs !== "number" ||
    !Number.isFinite(record.staleAfterMs) ||
    record.staleAfterMs < 0
  ) {
    invalidTopicSource("ROSBridge topic freshness.staleAfterMs must be a non-negative finite number");
  }
  return record.staleAfterMs;
}

function parseTopicSourceDefinition(
  definition: BaseResourceDefinition,
  config: Readonly<Record<string, unknown>>,
): PreparedRosbridgeTopicSource {
  if (typeof config.connection !== "string" || config.connection.length === 0) {
    invalidTopicSource(`Resource ${definition.id} requires a connection resource id`);
  }
  if (typeof config.topic !== "string" || !/^\/[^\s]*$/.test(config.topic)) {
    invalidTopicSource(`Resource ${definition.id} requires an absolute ROS topic name`, {
      topic: config.topic,
    });
  }
  if (!isCanonicalRosMessageType(config.messageType)) {
    invalidTopicSource(
      `Resource ${definition.id} requires canonical ROS messageType package/msg/Type`,
      { messageType: config.messageType },
    );
  }
  const expectedType = rosMessageTypeId(config.messageType);
  if (definition.type !== expectedType) {
    invalidTopicSource(
      `Resource ${definition.id} semantic type must match ROS messageType ${config.messageType}`,
      { expectedType, actualType: definition.type },
    );
  }

  const staleAfterMs = parseFreshness(config.freshness);
  return {
    connection: config.connection,
    topic: config.topic,
    messageType: config.messageType,
    subscription: parseSubscription(config.subscription),
    ...(staleAfterMs !== undefined ? { staleAfterMs } : {}),
  };
}

function parsePublish(value: unknown): RosbridgePublishOptions {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidTopicCommand("ROSBridge topic publish must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(["queueSize", "latch"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      invalidTopicCommand(`ROSBridge topic publish has unknown field ${key}`, { field: key });
    }
  }

  if (record.latch !== undefined && typeof record.latch !== "boolean") {
    invalidTopicCommand("ROSBridge topic publish.latch must be boolean", {
      value: record.latch,
    });
  }

  return {
    ...(record.queueSize !== undefined
      ? { queueSize: parseCommandNonNegativeInteger(record.queueSize, "queueSize") }
      : {}),
    ...(record.latch !== undefined ? { latch: record.latch } : {}),
  };
}

function parseTopicCommandDefinition(
  definition: BaseResourceDefinition,
  config: Readonly<Record<string, unknown>>,
): PreparedRosbridgeTopicCommand {
  if (typeof config.connection !== "string" || config.connection.length === 0) {
    invalidTopicCommand(`Resource ${definition.id} requires a connection resource id`);
  }
  if (typeof config.topic !== "string" || !/^\/[^\s]*$/.test(config.topic)) {
    invalidTopicCommand(`Resource ${definition.id} requires an absolute ROS topic name`, {
      topic: config.topic,
    });
  }
  if (!isCanonicalRosMessageType(config.messageType)) {
    invalidTopicCommand(
      `Resource ${definition.id} requires canonical ROS messageType package/msg/Type`,
      { messageType: config.messageType },
    );
  }
  const expectedType = rosMessageTypeId(config.messageType);
  if (definition.type !== expectedType) {
    invalidTopicCommand(
      `Resource ${definition.id} semantic type must match ROS messageType ${config.messageType}`,
      { expectedType, actualType: definition.type },
    );
  }

  return {
    connection: config.connection,
    topic: config.topic,
    messageType: config.messageType,
    publish: parsePublish(config.publish),
  };
}

function markConnectionLoss(controller: SourceController<RosMessage>, now: number): void {
  const current = controller.source.current();
  if (current.state !== "fresh") return;
  const stale: StaleObservation<RosMessage> = {
    ...current,
    state: "stale",
    staleSince: now,
  };
  controller.publishObservation(stale);
}

function topicOptions(prepared: PreparedRosbridgeTopicSource): RosbridgeTopicOptions {
  return {
    topic: prepared.topic,
    messageType: prepared.messageType,
    ...prepared.subscription,
  };
}

function commandTopicOptions(prepared: PreparedRosbridgeTopicCommand): RosbridgeTopicOptions {
  return {
    topic: prepared.topic,
    messageType: prepared.messageType,
    ...prepared.publish,
  };
}

export function createRosbridgeTransportPlugin(options: RosbridgeTransportPluginOptions = {}) {
  const clientFactory = options.clientFactory ?? defaultRosbridgeClientFactory;

  const connectionProvider: ResourceProvider<PreparedRosbridgeConnection> = {
    id: ROSBRIDGE_PROVIDER_IDS.connection,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["url", "reconnect"],
        required: ["url"],
      });
      return {
        id: definition.id,
        provider: ROSBRIDGE_PROVIDER_IDS.connection,
        type: definition.type,
        dependencies: [],
        prepared: parseConnectionDefinition(definition, config),
      };
    },
    create(definition, context): LiveResource {
      const connection = new RosbridgeConnection({
        id: definition.id,
        url: definition.prepared.url,
        reconnect: definition.prepared.reconnect,
        clock: context.clock,
        clientFactory,
      });
      connection.start();
      return {
        resource: connection,
        dispose(): void {
          connection.dispose();
        },
      };
    },
  };

  const topicSourceProvider: ResourceProvider<PreparedRosbridgeTopicSource> = {
    id: ROSBRIDGE_PROVIDER_IDS.topicSource,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["connection", "topic", "messageType", "subscription", "freshness"],
        required: ["connection", "topic", "messageType"],
      });
      const prepared = parseTopicSourceDefinition(definition, config);
      // Resolving the dependency here makes unknown references a compile-time
      // configuration error rather than a Runtime start failure.
      context.resourceType(prepared.connection);
      context.resolveType(definition.type);
      return {
        id: definition.id,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: definition.type,
        dependencies: [prepared.connection],
        prepared,
      };
    },
    create(definition, context): LiveResource {
      const connection = context.getResource(definition.prepared.connection);
      if (!(connection instanceof RosbridgeConnection)) {
        throw new RuntimeError({
          code: "GGCS_ROSBRIDGE_TOPIC_CONNECTION_INVALID",
          category: "provider_create",
          message: `Resource ${definition.id} requires a ROSBridge Connection`,
          details: {
            resource: definition.id,
            connection: definition.prepared.connection,
          },
        });
      }

      const controller = createSourceController<RosMessage>({
        id: definition.id,
        clock: context.clock,
        ...(definition.prepared.staleAfterMs !== undefined
          ? { freshness: { staleAfterMs: definition.prepared.staleAfterMs } }
          : {}),
      });

      const connectionSubscription = connection.subscribe((state) => {
        if (
          state.state === "connecting" ||
          state.state === "reconnecting" ||
          state.state === "disconnected"
        ) {
          markConnectionLoss(controller, context.clock.wallNow());
        }
      });

      const physicalSubscription = connection.acquireTopicSubscription(
        topicOptions(definition.prepared),
        {
          onMessage(message): void {
            if (message === null || typeof message !== "object" || Array.isArray(message)) {
              controller.fail(
                new RuntimeError({
                  code: "GGCS_ROSBRIDGE_TOPIC_MESSAGE_INVALID",
                  category: "resource_error",
                  message: `ROSBridge topic ${definition.prepared.topic} delivered a non-object message`,
                  details: {
                    resource: definition.id,
                    topic: definition.prepared.topic,
                    messageType: definition.prepared.messageType,
                  },
                }),
              );
              return;
            }
            controller.publish(message as RosMessage, {
              provenance: { resourceIds: [definition.id] },
            });
          },
          onError(error): void {
            controller.fail(error);
          },
        },
      );

      return {
        resource: controller.source,
        dispose(): void {
          physicalSubscription.unsubscribe();
          connectionSubscription.unsubscribe();
          controller.dispose();
        },
      };
    },
  };

  const topicCommandProvider: ResourceProvider<PreparedRosbridgeTopicCommand> = {
    id: ROSBRIDGE_PROVIDER_IDS.topicCommand,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["connection", "topic", "messageType", "publish"],
        required: ["connection", "topic", "messageType"],
      });
      const prepared = parseTopicCommandDefinition(definition, config);
      context.resourceType(prepared.connection);
      context.resolveType(definition.type);
      return {
        id: definition.id,
        provider: ROSBRIDGE_PROVIDER_IDS.topicCommand,
        type: definition.type,
        dependencies: [prepared.connection],
        prepared,
      };
    },
    create(definition, context): LiveResource {
      const connection = context.getResource(definition.prepared.connection);
      if (!(connection instanceof RosbridgeConnection)) {
        throw new RuntimeError({
          code: "GGCS_ROSBRIDGE_TOPIC_COMMAND_CONNECTION_INVALID",
          category: "provider_create",
          message: `Resource ${definition.id} requires a ROSBridge Connection`,
          details: {
            resource: definition.id,
            connection: definition.prepared.connection,
          },
        });
      }

      const publisher = connection.acquireTopicPublisher(
        commandTopicOptions(definition.prepared),
      );
      const command: Command<RosMessage> = {
        id: definition.id,
        kind: "command",
        async send(message: RosMessage): Promise<CommandDispatchReceipt> {
          if (message === null || typeof message !== "object" || Array.isArray(message)) {
            throw new RuntimeError({
              code: "GGCS_ROSBRIDGE_COMMAND_MESSAGE_INVALID",
              category: "command_dispatch",
              message: `ROSBridge topic Command ${definition.prepared.topic} requires a raw ROS message object`,
              details: {
                resource: definition.id,
                topic: definition.prepared.topic,
                messageType: definition.prepared.messageType,
              },
            });
          }
          publisher.publish(message);
          return {
            dispatchedAt: context.clock.wallNow(),
            metadata: {
              connection: definition.prepared.connection,
              topic: definition.prepared.topic,
              messageType: definition.prepared.messageType,
              sessionGeneration: connection.generation(),
            },
          };
        },
      };

      return {
        resource: command,
        dispose(): void {
          publisher.release();
        },
      };
    },
  };

  return definePlugin({
    manifest: {
      id: ROSBRIDGE_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    resourceProviders: [connectionProvider, topicSourceProvider, topicCommandProvider],
  });
}
