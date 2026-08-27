import {
  GGCS_SCHEMA_VERSION,
  type ApplicationDefinition,
  type BaseResourceDefinition,
  type ResourceId,
  type TypeId,
} from "@ggcs/schema";
import { SystemClock, type RuntimeClock } from "./clock.js";
import { RuntimeError, asRuntimeError } from "./error.js";
import type { PreparedResourceDefinition, ProviderPrepareContext } from "./provider.js";
import type { FrozenRegistry, RegistryBuilder } from "./registry.js";
import { Runtime } from "./runtime.js";

export interface CompiledRuntimeDefinition {
  readonly registry: FrozenRegistry;
  readonly orderedResources: readonly PreparedResourceDefinition[];
  createRuntime(options?: { readonly clock?: RuntimeClock }): Runtime;
}

function assertRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError({
      code: "GGCS_CONFIG_OBJECT_REQUIRED",
      category: "configuration",
      message,
    });
  }
  return value as Readonly<Record<string, unknown>>;
}

function sortPreparedResources(
  preparedById: ReadonlyMap<ResourceId, PreparedResourceDefinition>,
): readonly PreparedResourceDefinition[] {
  const visiting = new Set<ResourceId>();
  const visited = new Set<ResourceId>();
  const ordered: PreparedResourceDefinition[] = [];

  const visit = (resource: PreparedResourceDefinition): void => {
    if (visited.has(resource.id)) return;
    if (visiting.has(resource.id)) {
      throw new RuntimeError({
        code: "GGCS_RESOURCE_DEPENDENCY_CYCLE",
        category: "dependency_cycle",
        message: `Resource dependency cycle includes ${resource.id}`,
      });
    }
    visiting.add(resource.id);
    for (const dependencyId of resource.dependencies) {
      const dependency = preparedById.get(dependencyId);
      if (!dependency) {
        throw new RuntimeError({
          code: "GGCS_RESOURCE_DEPENDENCY_UNKNOWN",
          category: "configuration",
          message: `Resource ${resource.id} depends on unknown resource ${dependencyId}`,
        });
      }
      visit(dependency);
    }
    visiting.delete(resource.id);
    visited.add(resource.id);
    ordered.push(resource);
  };

  for (const resource of preparedById.values()) visit(resource);
  return ordered;
}

export function compileApplication(
  definition: ApplicationDefinition,
  registryInput: RegistryBuilder | FrozenRegistry,
): CompiledRuntimeDefinition {
  const root = assertRecord(definition, "Application definition must be an object");
  const rootAllowed = new Set(["schemaVersion", "plugins", "resources"]);
  for (const key of Object.keys(root)) {
    if (!rootAllowed.has(key)) {
      throw new RuntimeError({
        code: "GGCS_APPLICATION_FIELD_UNKNOWN",
        category: "schema",
        message: `Application definition has unknown field ${key}`,
      });
    }
  }
  if (!Array.isArray(definition.resources)) {
    throw new RuntimeError({
      code: "GGCS_APPLICATION_RESOURCES_INVALID",
      category: "schema",
      message: "Application resources must be an array",
    });
  }
  if (definition.plugins !== undefined && (!Array.isArray(definition.plugins) || !definition.plugins.every((id) => typeof id === "string"))) {
    throw new RuntimeError({
      code: "GGCS_APPLICATION_PLUGINS_INVALID",
      category: "schema",
      message: "Application plugins must be an array of plugin IDs",
    });
  }
  if (definition.schemaVersion !== GGCS_SCHEMA_VERSION) {
    throw new RuntimeError({
      code: "GGCS_SCHEMA_VERSION_UNSUPPORTED",
      category: "schema",
      message: `Unsupported GGCS schema version ${definition.schemaVersion}; expected ${GGCS_SCHEMA_VERSION}`,
    });
  }

  const registry = "freeze" in registryInput ? registryInput.freeze() : registryInput;
  for (const pluginId of definition.plugins ?? []) {
    if (!registry.hasPlugin(pluginId)) {
      throw new RuntimeError({
        code: "GGCS_APPLICATION_PLUGIN_MISSING",
        category: "plugin_dependency",
        message: `Application requires unregistered plugin ${pluginId}`,
      });
    }
  }

  const definitionsById = new Map<ResourceId, BaseResourceDefinition>();
  for (const resource of definition.resources) {
    const resourceRecord = assertRecord(resource, "Resource definition must be an object");
    const resourceAllowed = new Set(["id", "provider", "type", "config"]);
    for (const key of Object.keys(resourceRecord)) {
      if (!resourceAllowed.has(key)) {
        throw new RuntimeError({
          code: "GGCS_RESOURCE_FIELD_UNKNOWN",
          category: "schema",
          message: `Resource ${String(resourceRecord.id ?? "<unknown>")} has unknown field ${key}`,
        });
      }
    }
    if (!resource.id || !resource.provider || !resource.type) {
      throw new RuntimeError({
        code: "GGCS_RESOURCE_DEFINITION_INVALID",
        category: "configuration",
        message: "Every resource requires id, provider, and type",
      });
    }
    if (definitionsById.has(resource.id)) {
      throw new RuntimeError({
        code: "GGCS_RESOURCE_DUPLICATE",
        category: "configuration",
        message: `Duplicate resource id ${resource.id}`,
      });
    }
    registry.resolveType(resource.type);
    registry.resolveResourceProvider(resource.provider);
    definitionsById.set(resource.id, resource);
  }

  const prepareContext: ProviderPrepareContext = {
    resolveType: (id) => registry.resolveType(id),
    resolveComputation: (id) => registry.resolveComputation(id),
    resourceType(id: ResourceId): TypeId {
      const resource = definitionsById.get(id);
      if (!resource) {
        throw new RuntimeError({
          code: "GGCS_RESOURCE_UNKNOWN",
          category: "configuration",
          message: `Unknown resource ${id}`,
        });
      }
      return resource.type;
    },
    assertObjectConfig(resource, options): Readonly<Record<string, unknown>> {
      const config = resource.config ?? {};
      const record = assertRecord(config, `Resource ${resource.id} config must be an object`);
      const allowed = new Set(options.allowed);
      for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
          throw new RuntimeError({
            code: "GGCS_CONFIG_FIELD_UNKNOWN",
            category: "schema",
            message: `Resource ${resource.id} has unknown config field ${key}`,
          });
        }
      }
      for (const key of options.required ?? []) {
        if (!(key in record)) {
          throw new RuntimeError({
            code: "GGCS_CONFIG_FIELD_REQUIRED",
            category: "schema",
            message: `Resource ${resource.id} is missing required config field ${key}`,
          });
        }
      }
      return record;
    },
  };

  const preparedById = new Map<ResourceId, PreparedResourceDefinition>();
  for (const resource of definition.resources) {
    const provider = registry.resolveResourceProvider(resource.provider);
    try {
      const prepared = provider.prepare(resource, prepareContext);
      if (prepared.id !== resource.id || prepared.type !== resource.type || prepared.provider !== resource.provider) {
        throw new RuntimeError({
          code: "GGCS_PROVIDER_PREPARE_IDENTITY",
          category: "provider_prepare",
          message: `Provider ${provider.id} changed resource identity while preparing ${resource.id}`,
        });
      }
      preparedById.set(resource.id, prepared);
    } catch (error) {
      throw asRuntimeError(error, {
        code: "GGCS_PROVIDER_PREPARE_FAILED",
        category: "provider_prepare",
        message: `Provider ${provider.id} failed while preparing ${resource.id}`,
        details: { provider: provider.id, resource: resource.id },
      });
    }
  }

  const orderedResources = sortPreparedResources(preparedById);
  return {
    registry,
    orderedResources,
    createRuntime(options): Runtime {
      return new Runtime({
        registry,
        orderedResources,
        clock: options?.clock ?? new SystemClock(),
      });
    },
  };
}
