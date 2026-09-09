import {
  RuntimeError,
  createInvocationController,
  createSourceController,
  type Command,
  type CommandDispatchReceipt,
  type Invocation,
  type LiveResource,
  type Parameter,
  type ParameterProvider,
  type Procedure,
  type RuntimeClock,
  type SourceController,
  type StaleObservation,
  type Subscription,
  type ResourceProvider,
} from "@ggcs/core";
import { definePlugin } from "@ggcs/plugin-sdk";
import {
  isCanonicalRosMessageType,
  isCanonicalRosServiceType,
  isRosParameterAddress,
  parseRosParameterAddress,
  rosMessageTypeId,
  rosServiceTypeId,
  type RosMessage,
  type RosServiceRequest,
  type RosServiceResponse,
} from "@ggcs/ros";
import {
  CORE_TYPE_DESCRIPTORS,
  type BaseResourceDefinition,
  type ParameterDescriptor,
  type ParameterQuery,
  type ResourceId,
} from "@ggcs/schema";
import {
  defaultRosbridgeClientFactory,
  type RosbridgeClientFactory,
  type RosbridgeServiceOptions,
  type RosbridgeTopicOptions,
} from "./client.js";
import {
  RosbridgeConnection,
  type RosbridgeReconnectPolicy,
  type RosbridgeServiceClientLease,
} from "./connection.js";

export const ROSBRIDGE_PLUGIN_ID = "ggcs:transport-rosbridge" as const;

export const ROSBRIDGE_PROVIDER_IDS = {
  connection: "rosbridge:connection",
  topicSource: "rosbridge:topic-source",
  topicCommand: "rosbridge:topic-command",
  serviceProcedure: "rosbridge:service-procedure",
  parameterProvider: "rosbridge:parameter-provider",
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

export interface PreparedRosbridgeServiceProcedure {
  readonly connection: ResourceId;
  readonly service: string;
  readonly serviceType: string;
  readonly timeoutMs: number;
}

export interface PreparedRosbridgeParameterProvider {
  readonly connection: ResourceId;
  readonly timeoutMs: number;
}

export interface RosbridgeTransportPluginOptions {
  readonly clientFactory?: RosbridgeClientFactory;
}

const DEFAULT_SERVICE_TIMEOUT_MS = 10_000;
const DEFAULT_PARAMETER_TIMEOUT_MS = 10_000;

const ROSAPI_SERVICES = {
  nodes: {
    service: "/rosapi/nodes",
    serviceType: "rosapi_msgs/srv/Nodes",
  },
  getParam: {
    service: "/rosapi/get_param",
    serviceType: "rosapi_msgs/srv/GetParam",
  },
  setParam: {
    service: "/rosapi/set_param",
    serviceType: "rosapi_msgs/srv/SetParam",
  },
} as const satisfies Readonly<Record<string, RosbridgeServiceOptions>>;

const ROS2_LIST_PARAMETERS_SERVICE_TYPE = "rcl_interfaces/srv/ListParameters";
const ROS2_PARAMETER_LIST_TIMEOUT_MS = 5_000;

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

function invalidServiceProcedure(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RuntimeError({
    code: "GGCS_ROSBRIDGE_SERVICE_PROCEDURE_CONFIG_INVALID",
    category: "configuration",
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

function invalidParameterProvider(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RuntimeError({
    code: "GGCS_ROSBRIDGE_PARAMETER_PROVIDER_CONFIG_INVALID",
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

function parseServiceProcedureDefinition(
  definition: BaseResourceDefinition,
  config: Readonly<Record<string, unknown>>,
): PreparedRosbridgeServiceProcedure {
  if (typeof config.connection !== "string" || config.connection.length === 0) {
    invalidServiceProcedure(`Resource ${definition.id} requires a connection resource id`);
  }
  if (typeof config.service !== "string" || !/^\/[^\s]*$/.test(config.service)) {
    invalidServiceProcedure(`Resource ${definition.id} requires an absolute ROS service name`, {
      service: config.service,
    });
  }
  if (!isCanonicalRosServiceType(config.serviceType)) {
    invalidServiceProcedure(
      `Resource ${definition.id} requires canonical ROS serviceType package/srv/Type`,
      { serviceType: config.serviceType },
    );
  }
  const expectedType = rosServiceTypeId(config.serviceType);
  if (definition.type !== expectedType) {
    invalidServiceProcedure(
      `Resource ${definition.id} semantic type must match ROS serviceType ${config.serviceType}`,
      { expectedType, actualType: definition.type },
    );
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_SERVICE_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    invalidServiceProcedure(`Resource ${definition.id} timeoutMs must be a positive finite number`, {
      timeoutMs,
    });
  }
  return {
    connection: config.connection,
    service: config.service,
    serviceType: config.serviceType,
    timeoutMs,
  };
}

function parseParameterProviderDefinition(
  definition: BaseResourceDefinition,
  config: Readonly<Record<string, unknown>>,
): PreparedRosbridgeParameterProvider {
  if (typeof config.connection !== "string" || config.connection.length === 0) {
    invalidParameterProvider(`Resource ${definition.id} requires a connection resource id`);
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_PARAMETER_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    invalidParameterProvider(`Resource ${definition.id} timeoutMs must be a positive finite number`, {
      timeoutMs,
    });
  }
  return {
    connection: config.connection,
    timeoutMs,
  };
}

function serviceOptions(
  prepared: PreparedRosbridgeServiceProcedure,
): RosbridgeServiceOptions {
  return { service: prepared.service, serviceType: prepared.serviceType };
}

function isRosRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type RosapiOperation = "discovery" | "read" | "write";

interface RosapiCallOptions {
  readonly operation: RosapiOperation;
  readonly resource: ResourceId;
  readonly connection: ResourceId;
  readonly service: string;
  readonly timeoutMs: number;
  readonly parameter?: ResourceId;
}

function rosapiFailure(
  options: RosapiCallOptions,
  cause: unknown,
): RuntimeError {
  const code =
    options.operation === "discovery"
      ? "GGCS_ROSBRIDGE_PARAMETER_DISCOVERY_FAILURE"
      : options.operation === "read"
        ? "GGCS_ROSBRIDGE_PARAMETER_READ_FAILURE"
        : "GGCS_ROSBRIDGE_PARAMETER_WRITE_FAILURE";
  return new RuntimeError({
    code,
    category: options.operation === "write" ? "parameter_write" : "resource_unavailable",
    message: `ROSBridge rosapi parameter ${options.operation} failed via ${options.service}`,
    details: {
      resource: options.resource,
      connection: options.connection,
      service: options.service,
      ...(options.parameter !== undefined ? { parameter: options.parameter } : {}),
    },
    cause,
  });
}

function rosapiTimeout(options: RosapiCallOptions): RuntimeError {
  const code =
    options.operation === "discovery"
      ? "GGCS_ROSBRIDGE_PARAMETER_DISCOVERY_TIMEOUT"
      : options.operation === "read"
        ? "GGCS_ROSBRIDGE_PARAMETER_READ_TIMEOUT"
        : "GGCS_ROSBRIDGE_PARAMETER_WRITE_TIMEOUT";
  return new RuntimeError({
    code,
    category:
      options.operation === "discovery"
        ? "resource_unavailable"
        : "invocation_timeout",
    message: `ROSBridge rosapi parameter ${options.operation} timed out after ${options.timeoutMs}ms`,
    details: {
      resource: options.resource,
      connection: options.connection,
      service: options.service,
      timeoutMs: options.timeoutMs,
      ...(options.parameter !== undefined ? { parameter: options.parameter } : {}),
    },
  });
}

function callRosapi(
  client: RosbridgeServiceClientLease,
  request: Readonly<Record<string, unknown>>,
  clock: RuntimeClock,
  options: RosapiCallOptions,
): Promise<Readonly<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let terminal = false;
    let callSubscription: Subscription | undefined;
    const timeoutTask = clock.schedule(options.timeoutMs, () => {
      if (terminal) return;
      terminal = true;
      callSubscription?.unsubscribe();
      reject(rosapiTimeout(options));
    });

    const finish = (
      callback: () => void,
    ): void => {
      if (terminal) return;
      terminal = true;
      timeoutTask.cancel();
      callSubscription?.unsubscribe();
      callback();
    };

    try {
      callSubscription = client.call(
        request,
        (response) => {
          finish(() => {
            if (!isRosRecord(response)) {
              reject(
                rosapiFailure(
                  options,
                  new Error(`rosapi service ${options.service} returned a non-object response`),
                ),
              );
              return;
            }
            resolve(response);
          });
        },
        (error) => finish(() => reject(rosapiFailure(options, error))),
      );
      if (terminal) callSubscription.unsubscribe();
    } catch (error) {
      finish(() => reject(rosapiFailure(options, error)));
    }
  });
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

  const serviceProcedureProvider: ResourceProvider<PreparedRosbridgeServiceProcedure> = {
    id: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["connection", "service", "serviceType", "timeoutMs"],
        required: ["connection", "service", "serviceType"],
      });
      const prepared = parseServiceProcedureDefinition(definition, config);
      context.resourceType(prepared.connection);
      context.resolveType(definition.type);
      return {
        id: definition.id,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: definition.type,
        dependencies: [prepared.connection],
        prepared,
      };
    },
    create(definition, context): LiveResource {
      const connection = context.getResource(definition.prepared.connection);
      if (!(connection instanceof RosbridgeConnection)) {
        throw new RuntimeError({
          code: "GGCS_ROSBRIDGE_SERVICE_CONNECTION_INVALID",
          category: "provider_create",
          message: `Resource ${definition.id} requires a ROSBridge Connection`,
          details: {
            resource: definition.id,
            connection: definition.prepared.connection,
          },
        });
      }

      const client = connection.acquireServiceClient(serviceOptions(definition.prepared));
      let disposed = false;
      const procedure: Procedure<RosServiceRequest, RosServiceResponse> = {
        id: definition.id,
        kind: "procedure",
        invoke(input: RosServiceRequest): Invocation<RosServiceResponse> {
          const controller = createInvocationController<RosServiceResponse>({
            clock: context.clock,
            failureCode: "GGCS_ROSBRIDGE_SERVICE_FAILURE",
          });

          if (disposed) {
            controller.fail(
              new RuntimeError({
                code: "GGCS_ROSBRIDGE_SERVICE_DISPOSED",
                category: "invocation_failure",
                message: `ROSBridge service Procedure ${definition.id} is disposed`,
                details: { resource: definition.id, service: definition.prepared.service },
              }),
            );
            return controller.invocation;
          }
          if (!isRosRecord(input)) {
            controller.fail(
              new RuntimeError({
                code: "GGCS_ROSBRIDGE_SERVICE_REQUEST_INVALID",
                category: "invocation_failure",
                message: `ROSBridge service ${definition.prepared.service} requires a raw ROS request object`,
                details: {
                  resource: definition.id,
                  service: definition.prepared.service,
                  serviceType: definition.prepared.serviceType,
                },
              }),
            );
            return controller.invocation;
          }

          let callSubscription: Subscription | undefined;
          let stateSubscription: Subscription | undefined;
          const timeoutTask = context.clock.schedule(definition.prepared.timeoutMs, () => {
            controller.timeout(
              new RuntimeError({
                code: "GGCS_ROSBRIDGE_SERVICE_TIMEOUT",
                category: "invocation_timeout",
                message: `ROSBridge service ${definition.prepared.service} timed out after ${definition.prepared.timeoutMs}ms`,
                details: {
                  resource: definition.id,
                  connection: definition.prepared.connection,
                  service: definition.prepared.service,
                  serviceType: definition.prepared.serviceType,
                  timeoutMs: definition.prepared.timeoutMs,
                },
              }),
            );
          });
          const detachWhenTerminal = (): void => {
            if (controller.invocation.current().state === "pending") return;
            timeoutTask.cancel();
            callSubscription?.unsubscribe();
            stateSubscription?.unsubscribe();
          };
          stateSubscription = controller.invocation.subscribe(detachWhenTerminal);

          try {
            callSubscription = client.call(
              input,
              (response) => {
                if (!isRosRecord(response)) {
                  controller.fail(
                    new RuntimeError({
                      code: "GGCS_ROSBRIDGE_SERVICE_RESPONSE_INVALID",
                      category: "invocation_failure",
                      message: `ROSBridge service ${definition.prepared.service} returned a non-object response`,
                      details: {
                        resource: definition.id,
                        service: definition.prepared.service,
                        serviceType: definition.prepared.serviceType,
                      },
                    }),
                  );
                  return;
                }
                controller.succeed(response as RosServiceResponse);
              },
              (error) => controller.fail(error),
            );
          } catch (error) {
            controller.fail(error);
          }
          detachWhenTerminal();
          return controller.invocation;
        },
      };

      return {
        resource: procedure,
        dispose(): void {
          if (disposed) return;
          disposed = true;
          client.release();
        },
      };
    },
  };

  const parameterProvider: ResourceProvider<PreparedRosbridgeParameterProvider> = {
    id: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["connection", "timeoutMs"],
        required: ["connection"],
      });
      const prepared = parseParameterProviderDefinition(definition, config);
      context.resourceType(prepared.connection);
      context.resolveType(definition.type);
      return {
        id: definition.id,
        provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
        type: definition.type,
        dependencies: [prepared.connection],
        prepared,
      };
    },
    create(definition, context): LiveResource {
      const connection = context.getResource(definition.prepared.connection);
      if (!(connection instanceof RosbridgeConnection)) {
        throw new RuntimeError({
          code: "GGCS_ROSBRIDGE_PARAMETER_CONNECTION_INVALID",
          category: "provider_create",
          message: `Resource ${definition.id} requires a ROSBridge Connection`,
          details: {
            resource: definition.id,
            connection: definition.prepared.connection,
          },
        });
      }

      const nodesClient = connection.acquireServiceClient(ROSAPI_SERVICES.nodes);
      const getClient = connection.acquireServiceClient(ROSAPI_SERVICES.getParam);
      const setClient = connection.acquireServiceClient(ROSAPI_SERVICES.setParam);
      const parameters = new Map<ResourceId, {
        readonly parameter: Parameter<string>;
        readonly controller: SourceController<string>;
      }>();
      const known = new Set<ResourceId>();
      let disposed = false;

      const descriptorFor = (id: ResourceId): ParameterDescriptor<string> => ({
        id,
        type: CORE_TYPE_DESCRIPTORS.string,
        writable: true,
      });

      const callOptions = (
        operation: RosapiOperation,
        service: string,
        parameter?: ResourceId,
        timeoutMs = definition.prepared.timeoutMs,
      ): RosapiCallOptions => ({
        operation,
        resource: definition.id,
        connection: definition.prepared.connection,
        service,
        timeoutMs,
        ...(parameter !== undefined ? { parameter } : {}),
      });

      const ensureActive = (): void => {
        if (!disposed) return;
        throw new RuntimeError({
          code: "GGCS_ROSBRIDGE_PARAMETER_PROVIDER_DISPOSED",
          category: "resource_unavailable",
          message: `ROSBridge ParameterProvider ${definition.id} is disposed`,
          details: { resource: definition.id },
        });
      };

      const nativeListParameters = async (
        nodes: readonly string[],
      ): Promise<{
        readonly ids: readonly ResourceId[];
        readonly attemptedNodes: number;
        readonly successfulNodes: number;
      }> => {
        const fallbackTimeoutMs = Math.min(
          definition.prepared.timeoutMs,
          ROS2_PARAMETER_LIST_TIMEOUT_MS,
        );
        const fallbackNodes = nodes.filter(
          (node) =>
            /^\/[^\s]*$/.test(node) &&
            node !== "/rosapi" &&
            node !== "/rosapi_params",
        );
        const perNode = await Promise.allSettled(
          fallbackNodes.map(async (node): Promise<readonly ResourceId[]> => {
            const service = `${node.replace(/\/$/, "")}/list_parameters`;
            const lease = connection.acquireServiceClient({
              service,
              serviceType: ROS2_LIST_PARAMETERS_SERVICE_TYPE,
            });
            try {
              const response = await callRosapi(
                lease,
                { prefixes: [], depth: 0 },
                context.clock,
                callOptions("discovery", service, undefined, fallbackTimeoutMs),
              );
              const result = response.result;
              if (!isRosRecord(result)) {
                throw rosapiFailure(
                  callOptions("discovery", service, undefined, fallbackTimeoutMs),
                  new Error("ROS 2 list_parameters response.result must be an object"),
                );
              }
              const names = result.names;
              if (!Array.isArray(names) || !names.every((value) => typeof value === "string")) {
                throw rosapiFailure(
                  callOptions("discovery", service, undefined, fallbackTimeoutMs),
                  new Error("ROS 2 list_parameters response.result.names must be string[]"),
                );
              }
              return (names as string[])
                .map((name) => `${node}:${name}`)
                .filter((id): id is ResourceId => isRosParameterAddress(id));
            } finally {
              lease.release();
            }
          }),
        );

        const discovered = new Set<ResourceId>();
        let successfulNodes = 0;
        for (const result of perNode) {
          if (result.status !== "fulfilled") continue;
          successfulNodes += 1;
          for (const id of result.value) discovered.add(id);
        }
        return {
          ids: [...discovered].sort(),
          attemptedNodes: fallbackNodes.length,
          successfulNodes,
        };
      };

      const discover = async (): Promise<readonly ParameterDescriptor<unknown>[]> => {
        ensureActive();

        // Humble rosapi's global get_param_names callback can spend multiple seconds
        // synchronously walking every node's parameter services. A GGCS-side timeout
        // cannot cancel an already-dispatched ordinary ROS service call, so probing
        // get_param_names in parallel can starve otherwise healthy rosapi calls such
        // as /rosapi/nodes and subsequent get/set operations. Discover the node set
        // first, then query each node through ROS 2's standard ListParameters service.
        // rosapi remains the transport boundary for node discovery and get/set; the
        // transport-specific Humble workaround stays hidden behind ParameterProvider.
        const nodesResponse = await callRosapi(
          nodesClient,
          {},
          context.clock,
          callOptions("discovery", ROSAPI_SERVICES.nodes.service),
        );
        const nodesValue = nodesResponse.nodes;
        if (
          !Array.isArray(nodesValue) ||
          !nodesValue.every((value) => typeof value === "string")
        ) {
          throw rosapiFailure(
            callOptions("discovery", ROSAPI_SERVICES.nodes.service),
            new Error("rosapi nodes response.nodes must be string[]"),
          );
        }

        const nodes = [...new Set(nodesValue as string[])];
        const native = await nativeListParameters(nodes);
        if (native.attemptedNodes > 0 && native.successfulNodes === 0) {
          throw rosapiFailure(
            callOptions("discovery", "*/list_parameters"),
            new Error("No discovered ROS node responded to ListParameters"),
          );
        }

        const discovered = native.ids;
        known.clear();
        for (const id of discovered) known.add(id);
        return discovered.map((id) => descriptorFor(id));
      };

      const getOrCreateParameter = (id: ResourceId): Parameter<string> => {
        const existing = parameters.get(id);
        if (existing) return existing.parameter;

        const controller = createSourceController<string>({
          id: `${definition.id}:${id}:value`,
          clock: context.clock,
        });
        const descriptor = descriptorFor(id);
        const parameter: Parameter<string> = {
          id,
          kind: "parameter",
          descriptor,
          value: controller.source,
          refresh(): Invocation<string> {
            const invocationController = createInvocationController<string>({
              clock: context.clock,
              failureCode: "GGCS_ROSBRIDGE_PARAMETER_READ_FAILURE",
            });
            if (disposed) {
              invocationController.fail(
                new RuntimeError({
                  code: "GGCS_ROSBRIDGE_PARAMETER_PROVIDER_DISPOSED",
                  category: "resource_unavailable",
                  message: `ROSBridge ParameterProvider ${definition.id} is disposed`,
                  details: { resource: definition.id, parameter: id },
                }),
              );
              return invocationController.invocation;
            }

            void callRosapi(
              getClient,
              { name: id, default_value: "" },
              context.clock,
              callOptions("read", ROSAPI_SERVICES.getParam.service, id),
            ).then(
              (response) => {
                if (typeof response.value !== "string") {
                  const error = rosapiFailure(
                    callOptions("read", ROSAPI_SERVICES.getParam.service, id),
                    new Error("rosapi get_param response.value must be a string"),
                  );
                  controller.fail(error, true);
                  invocationController.fail(error);
                  return;
                }
                controller.publish(response.value, {
                  provenance: { resourceIds: [definition.id, id] },
                });
                invocationController.succeed(response.value);
              },
              (error) => {
                const runtimeError =
                  error instanceof RuntimeError
                    ? error
                    : rosapiFailure(
                        callOptions("read", ROSAPI_SERVICES.getParam.service, id),
                        error,
                      );
                controller.fail(runtimeError, true);
                if (runtimeError.category === "invocation_timeout") {
                  invocationController.timeout(runtimeError);
                } else {
                  invocationController.fail(runtimeError);
                }
              },
            );
            return invocationController.invocation;
          },
          write(value: string): Invocation<void> {
            const invocationController = createInvocationController<void>({
              clock: context.clock,
              failureCode: "GGCS_ROSBRIDGE_PARAMETER_WRITE_FAILURE",
            });
            if (disposed) {
              invocationController.fail(
                new RuntimeError({
                  code: "GGCS_ROSBRIDGE_PARAMETER_PROVIDER_DISPOSED",
                  category: "parameter_write",
                  message: `ROSBridge ParameterProvider ${definition.id} is disposed`,
                  details: { resource: definition.id, parameter: id },
                }),
              );
              return invocationController.invocation;
            }
            if (typeof value !== "string") {
              invocationController.fail(
                new RuntimeError({
                  code: "GGCS_ROSBRIDGE_PARAMETER_VALUE_INVALID",
                  category: "parameter_validation",
                  message: `ROSBridge parameter ${id} requires a string value`,
                  details: { resource: definition.id, parameter: id, value },
                }),
              );
              return invocationController.invocation;
            }

            void callRosapi(
              setClient,
              { name: id, value },
              context.clock,
              callOptions("write", ROSAPI_SERVICES.setParam.service, id),
            ).then(
              () => invocationController.succeed(undefined),
              (error) => {
                const runtimeError =
                  error instanceof RuntimeError
                    ? error
                    : rosapiFailure(
                        callOptions("write", ROSAPI_SERVICES.setParam.service, id),
                        error,
                      );
                if (runtimeError.category === "invocation_timeout") {
                  invocationController.timeout(runtimeError);
                } else {
                  invocationController.fail(runtimeError);
                }
              },
            );
            return invocationController.invocation;
          },
        };
        parameters.set(id, { parameter, controller });
        return parameter;
      };

      const provider: ParameterProvider = {
        id: definition.id,
        kind: "parameter_provider",
        async list(query?: ParameterQuery): Promise<readonly ParameterDescriptor<unknown>[]> {
          const descriptors = await discover();
          return descriptors.filter(
            (descriptor) =>
              (query?.prefix === undefined || descriptor.id.startsWith(query.prefix)) &&
              (query?.writable === undefined || descriptor.writable === query.writable),
          );
        },
        async resolve<T = unknown>(id: ResourceId): Promise<Parameter<T>> {
          ensureActive();
          if (!isRosParameterAddress(id)) {
            throw new RuntimeError({
              code: "GGCS_ROSBRIDGE_PARAMETER_ID_INVALID",
              category: "parameter_validation",
              message: `ROSBridge parameter id must use <absolute-node>:<parameter-name>: ${id}`,
              details: { resource: definition.id, parameter: id },
            });
          }
          if (!known.has(id)) await discover();
          if (!known.has(id)) {
            throw new RuntimeError({
              code: "GGCS_ROSBRIDGE_PARAMETER_UNKNOWN",
              category: "resource_unavailable",
              message: `ROSBridge parameter ${id} was not discovered by rosapi`,
              details: { resource: definition.id, parameter: id },
            });
          }
          return getOrCreateParameter(id) as Parameter<T>;
        },
      };

      return {
        resource: provider,
        dispose(): void {
          if (disposed) return;
          disposed = true;
          for (const entry of parameters.values()) entry.controller.dispose();
          parameters.clear();
          known.clear();
          nodesClient.release();
          getClient.release();
          setClient.release();
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
    resourceProviders: [
      connectionProvider,
      topicSourceProvider,
      topicCommandProvider,
      serviceProcedureProvider,
      parameterProvider,
    ],
  });
}
