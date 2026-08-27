import type {
  ComputationRegistration,
  PluginDefinition,
  ResourceProvider,
} from "@ggcs/core";
import type { TypeDescriptor } from "@ggcs/schema";

/** Type-preserving helpers for extension authors. No registration side effects. */
export function definePlugin<T extends PluginDefinition>(plugin: T): T {
  return plugin;
}

export function defineType<T>(descriptor: TypeDescriptor<T>): TypeDescriptor<T> {
  return descriptor;
}

export function defineResourceProvider<T extends ResourceProvider>(provider: T): T {
  return provider;
}

export function defineComputation<T>(
  computation: ComputationRegistration<T>,
): ComputationRegistration<T> {
  return computation;
}

export {
  defineValueTransform,
  type ComputationContext,
  type ComputationInstance,
  type ComputationRegistration,
  type FrozenRegistry,
  type LiveResource,
  type PluginDefinition,
  type PreparedResourceDefinition,
  type ProviderPrepareContext,
  type RegistryBuilder,
  type ResourceCreateContext,
  type ResourceProvider,
} from "@ggcs/core";

export type {
  ApplicationDefinition,
  BaseResourceDefinition,
  JsonSchema,
  PluginManifest,
  PluginRequirement,
  TypeDescriptor,
} from "@ggcs/schema";
