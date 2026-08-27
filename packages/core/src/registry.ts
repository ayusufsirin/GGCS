import {
  CORE_TYPE_DESCRIPTORS,
  GGCS_API_VERSION,
  type ComputationId,
  type PluginId,
  type PluginManifest,
  type ProviderId,
  type TypeDescriptor,
  type TypeId,
} from "@ggcs/schema";
import { derivedResourceProvider, type ComputationRegistration } from "./derived.js";
import { RuntimeError } from "./error.js";
import type { ResourceProvider } from "./provider.js";
import { satisfiesVersion } from "./semver.js";

export interface PluginDefinition {
  readonly manifest: PluginManifest;
  readonly types?: readonly TypeDescriptor<unknown>[];
  readonly resourceProviders?: readonly ResourceProvider[];
  readonly computations?: readonly ComputationRegistration<unknown>[];
}

export interface FrozenRegistry {
  readonly plugins: ReadonlyMap<PluginId, PluginDefinition>;
  resolveType(id: TypeId): TypeDescriptor<unknown>;
  resolveResourceProvider(id: ProviderId): ResourceProvider;
  resolveComputation(id: ComputationId): ComputationRegistration<unknown>;
  hasPlugin(id: PluginId): boolean;
  isTypeCompatible(source: TypeId, target: TypeId): boolean;
}

function topologicalPluginOrder(plugins: ReadonlyMap<PluginId, PluginDefinition>): readonly PluginDefinition[] {
  const visiting = new Set<PluginId>();
  const visited = new Set<PluginId>();
  const ordered: PluginDefinition[] = [];

  const visit = (plugin: PluginDefinition): void => {
    const id = plugin.manifest.id;
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new RuntimeError({
        code: "GGCS_PLUGIN_DEPENDENCY_CYCLE",
        category: "dependency_cycle",
        message: `Plugin dependency cycle includes ${id}`,
      });
    }
    visiting.add(id);
    for (const requirement of plugin.manifest.requires ?? []) {
      const dependency = plugins.get(requirement.id);
      if (!dependency) {
        throw new RuntimeError({
          code: "GGCS_PLUGIN_DEPENDENCY_MISSING",
          category: "plugin_dependency",
          message: `Plugin ${id} requires missing plugin ${requirement.id}`,
          details: { plugin: id, dependency: requirement.id },
        });
      }
      if (!satisfiesVersion(dependency.manifest.version, requirement.version)) {
        throw new RuntimeError({
          code: "GGCS_PLUGIN_DEPENDENCY_VERSION",
          category: "plugin_version",
          message: `Plugin ${id} requires ${requirement.id}@${requirement.version}, found ${dependency.manifest.version}`,
        });
      }
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(plugin);
  };

  for (const plugin of plugins.values()) visit(plugin);
  return ordered;
}

export class RegistryBuilder {
  private readonly pluginDefinitions = new Map<PluginId, PluginDefinition>();
  private frozen = false;

  register(plugin: PluginDefinition): this {
    if (this.frozen) {
      throw new RuntimeError({
        code: "GGCS_REGISTRY_FROZEN",
        category: "runtime_lifecycle",
        message: "Plugin registry is frozen",
      });
    }
    if (this.pluginDefinitions.has(plugin.manifest.id)) {
      throw new RuntimeError({
        code: "GGCS_PLUGIN_DUPLICATE",
        category: "unknown_registration",
        message: `Plugin ${plugin.manifest.id} is already registered`,
      });
    }
    this.pluginDefinitions.set(plugin.manifest.id, plugin);
    return this;
  }

  freeze(): FrozenRegistry {
    if (this.frozen) {
      throw new RuntimeError({
        code: "GGCS_REGISTRY_ALREADY_FROZEN",
        category: "runtime_lifecycle",
        message: "Plugin registry has already been frozen",
      });
    }
    this.frozen = true;

    for (const plugin of this.pluginDefinitions.values()) {
      if (!satisfiesVersion(GGCS_API_VERSION, plugin.manifest.ggcsApi)) {
        throw new RuntimeError({
          code: "GGCS_PLUGIN_API_VERSION",
          category: "plugin_version",
          message: `Plugin ${plugin.manifest.id} requires GGCS API ${plugin.manifest.ggcsApi}, current ${GGCS_API_VERSION}`,
        });
      }
    }

    const ordered = topologicalPluginOrder(this.pluginDefinitions);
    const types = new Map<TypeId, TypeDescriptor<unknown>>();
    const providers = new Map<ProviderId, ResourceProvider>();
    const computations = new Map<ComputationId, ComputationRegistration<unknown>>();

    for (const descriptor of Object.values(CORE_TYPE_DESCRIPTORS)) {
      types.set(descriptor.id, descriptor);
    }
    providers.set(derivedResourceProvider.id, derivedResourceProvider);

    const ownerByType = new Map<string, string>();
    const ownerByProvider = new Map<string, string>();
    const ownerByComputation = new Map<string, string>();

    for (const plugin of ordered) {
      for (const descriptor of plugin.types ?? []) {
        if (types.has(descriptor.id)) {
          throw new RuntimeError({
            code: "GGCS_TYPE_DUPLICATE",
            category: "unknown_registration",
            message: `Type ${descriptor.id} is already registered`,
            details: { owner: ownerByType.get(descriptor.id), plugin: plugin.manifest.id },
          });
        }
        types.set(descriptor.id, descriptor);
        ownerByType.set(descriptor.id, plugin.manifest.id);
      }
      for (const provider of plugin.resourceProviders ?? []) {
        if (providers.has(provider.id)) {
          throw new RuntimeError({
            code: "GGCS_PROVIDER_DUPLICATE",
            category: "unknown_registration",
            message: `Provider ${provider.id} is already registered`,
            details: { owner: ownerByProvider.get(provider.id), plugin: plugin.manifest.id },
          });
        }
        providers.set(provider.id, provider);
        ownerByProvider.set(provider.id, plugin.manifest.id);
      }
      for (const computation of plugin.computations ?? []) {
        if (computations.has(computation.id)) {
          throw new RuntimeError({
            code: "GGCS_COMPUTATION_DUPLICATE",
            category: "unknown_registration",
            message: `Computation ${computation.id} is already registered`,
            details: { owner: ownerByComputation.get(computation.id), plugin: plugin.manifest.id },
          });
        }
        computations.set(computation.id, computation);
        ownerByComputation.set(computation.id, plugin.manifest.id);
      }
    }

    const pluginsSnapshot = new Map(this.pluginDefinitions);
    return {
      plugins: pluginsSnapshot,
      resolveType(id: TypeId): TypeDescriptor<unknown> {
        const descriptor = types.get(id);
        if (!descriptor) {
          throw new RuntimeError({
            code: "GGCS_TYPE_UNKNOWN",
            category: "unknown_registration",
            message: `Unknown semantic type ${id}`,
          });
        }
        return descriptor;
      },
      resolveResourceProvider(id: ProviderId): ResourceProvider {
        const provider = providers.get(id);
        if (!provider) {
          throw new RuntimeError({
            code: "GGCS_PROVIDER_UNKNOWN",
            category: "unknown_registration",
            message: `Unknown resource provider ${id}`,
          });
        }
        return provider;
      },
      resolveComputation(id: ComputationId): ComputationRegistration<unknown> {
        const computation = computations.get(id);
        if (!computation) {
          throw new RuntimeError({
            code: "GGCS_COMPUTATION_UNKNOWN",
            category: "unknown_registration",
            message: `Unknown computation ${id}`,
          });
        }
        return computation;
      },
      hasPlugin(id: PluginId): boolean {
        return pluginsSnapshot.has(id);
      },
      isTypeCompatible(source: TypeId, target: TypeId): boolean {
        if (source === target) return true;
        const sourceDescriptor = types.get(source);
        const targetDescriptor = types.get(target);
        if (!sourceDescriptor || !targetDescriptor) return false;
        return (
          sourceDescriptor.compatibleWith?.includes(target) === true ||
          targetDescriptor.compatibleWith?.includes(source) === true
        );
      },
    };
  }
}

export function createRegistryBuilder(): RegistryBuilder {
  return new RegistryBuilder();
}
