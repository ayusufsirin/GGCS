import type {
  BaseResourceDefinition,
  ComputationId,
  ProviderId,
  ResourceId,
  TypeDescriptor,
  TypeId,
} from "@ggcs/schema";
import type { RuntimeClock } from "./clock.js";
import type { ComputationRegistration } from "./derived.js";
import type { RuntimeResource } from "./resources.js";

export interface PreparedResourceDefinition<TPrepared = unknown> {
  readonly id: ResourceId;
  readonly provider: ProviderId;
  readonly type: TypeId;
  readonly dependencies: readonly ResourceId[];
  readonly prepared: TPrepared;
}

export interface ProviderPrepareContext {
  resolveType(id: TypeId): TypeDescriptor<unknown>;
  resolveComputation(id: ComputationId): ComputationRegistration<unknown>;
  resourceType(id: ResourceId): TypeId;
  assertObjectConfig(
    definition: BaseResourceDefinition,
    options: {
      readonly allowed: readonly string[];
      readonly required?: readonly string[];
    },
  ): Readonly<Record<string, unknown>>;
}

export interface ResourceCreateContext {
  readonly clock: RuntimeClock;
  getResource<T extends RuntimeResource = RuntimeResource>(id: ResourceId): T;
}

export interface LiveResource<T extends RuntimeResource = RuntimeResource> {
  readonly resource: T;
  dispose?(): void | Promise<void>;
}

export interface ResourceProvider<TPrepared = unknown> {
  readonly id: ProviderId;
  prepare(
    definition: BaseResourceDefinition,
    context: ProviderPrepareContext,
  ): PreparedResourceDefinition<TPrepared>;
  create(
    definition: PreparedResourceDefinition<TPrepared>,
    context: ResourceCreateContext,
  ): LiveResource | Promise<LiveResource>;
}
