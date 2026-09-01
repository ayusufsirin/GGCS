import { RuntimeError, type LiveResource, type ResourceProvider } from "@ggcs/core";
import { definePlugin } from "@ggcs/plugin-sdk";
import type { BaseResourceDefinition } from "@ggcs/schema";
import {
  defaultRosbridgeClientFactory,
  type RosbridgeClientFactory,
} from "./client.js";
import {
  RosbridgeConnection,
  type RosbridgeReconnectPolicy,
} from "./connection.js";

export const ROSBRIDGE_PLUGIN_ID = "ggcs:transport-rosbridge" as const;

export const ROSBRIDGE_PROVIDER_IDS = {
  connection: "rosbridge:connection",
} as const;

export interface PreparedRosbridgeConnection {
  readonly url: string;
  readonly reconnect: RosbridgeReconnectPolicy;
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

function parseConnectionDefinition(definition: BaseResourceDefinition, config: Readonly<Record<string, unknown>>): PreparedRosbridgeConnection {
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

  return definePlugin({
    manifest: {
      id: ROSBRIDGE_PLUGIN_ID,
      version: "0.1.0",
      ggcsApi: "^0.1.0",
    },
    resourceProviders: [connectionProvider],
  });
}
