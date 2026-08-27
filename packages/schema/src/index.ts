/** Portable GGCS schema primitives. This package contains no runtime lifecycle code. */

export const GGCS_SCHEMA_VERSION = "0.1" as const;
export const GGCS_API_VERSION = "0.1.0" as const;

export type SchemaVersion = typeof GGCS_SCHEMA_VERSION;
export type ConnectionId = string;
export type ResourceId = string;
export type PluginId = string;
export type ProviderId = string;
export type ComputationId = string;
export type TypeId = string;
export type PresentationId = string;
export type WidgetInstanceId = string;
export type WidgetTypeId = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * JSON-Schema-compatible descriptor surface. GGCS deliberately does not expose
 * a validator implementation as part of its public contract.
 */
export type JsonSchema = Readonly<Record<string, unknown>>;

export interface TypeDescriptor<T = unknown> {
  readonly id: TypeId;
  readonly schema: JsonSchema;
  readonly title?: string;
  readonly description?: string;
  /** Explicit semantic aliases that can bind without a transform. */
  readonly compatibleWith?: readonly TypeId[];
  /** Compile-time phantom only; never serialized. */
  readonly __type?: T;
}

export interface PluginRequirement {
  readonly id: PluginId;
  readonly version: string;
}

export interface PluginManifest {
  readonly id: PluginId;
  readonly version: string;
  readonly ggcsApi: string;
  readonly requires?: readonly PluginRequirement[];
}

export interface BaseResourceDefinition {
  readonly id: ResourceId;
  readonly provider: ProviderId;
  readonly type: TypeId;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface ApplicationDefinition {
  readonly schemaVersion: SchemaVersion | string;
  /** Plugins that the application requires to be present in the frozen registry. */
  readonly plugins?: readonly PluginId[];
  readonly resources: readonly BaseResourceDefinition[];
}

export interface ParameterConstraints {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly JsonValue[];
  readonly pattern?: string;
}

export interface ParameterDescriptor<T = unknown> {
  readonly id: ResourceId;
  readonly type: TypeDescriptor<T>;
  readonly writable: boolean;
  readonly description?: string;
  readonly unit?: string;
  readonly defaultValue?: T;
  readonly constraints?: ParameterConstraints;
}

export interface ParameterQuery {
  readonly prefix?: string;
  readonly writable?: boolean;
}

export const CORE_TYPE_IDS = {
  unknown: "ggcs:type/unknown",
  boolean: "ggcs:type/boolean",
  number: "ggcs:type/number",
  string: "ggcs:type/string",
  object: "ggcs:type/object",
} as const;

export const CORE_TYPE_DESCRIPTORS = {
  unknown: {
    id: CORE_TYPE_IDS.unknown,
    schema: {},
    title: "Unknown",
  },
  boolean: {
    id: CORE_TYPE_IDS.boolean,
    schema: { type: "boolean" },
    title: "Boolean",
  },
  number: {
    id: CORE_TYPE_IDS.number,
    schema: { type: "number" },
    title: "Number",
  },
  string: {
    id: CORE_TYPE_IDS.string,
    schema: { type: "string" },
    title: "String",
  },
  object: {
    id: CORE_TYPE_IDS.object,
    schema: { type: "object" },
    title: "Object",
  },
} as const satisfies Record<string, TypeDescriptor<unknown>>;
