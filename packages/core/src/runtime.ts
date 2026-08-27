import type { ResourceId } from "@ggcs/schema";
import type { RuntimeClock } from "./clock.js";
import { RuntimeError, asRuntimeError } from "./error.js";
import type { LiveResource, PreparedResourceDefinition } from "./provider.js";
import type { FrozenRegistry } from "./registry.js";
import type { RuntimeResource } from "./resources.js";

export type RuntimeState = "created" | "starting" | "running" | "stopping" | "stopped" | "error";

export class Runtime {
  private runtimeState: RuntimeState = "created";
  private readonly liveResources = new Map<ResourceId, LiveResource>();
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(
    private readonly options: {
      readonly registry: FrozenRegistry;
      readonly orderedResources: readonly PreparedResourceDefinition[];
      readonly clock: RuntimeClock;
    },
  ) {}

  state(): RuntimeState {
    return this.runtimeState;
  }

  resource<T extends RuntimeResource = RuntimeResource>(id: ResourceId): T {
    const live = this.liveResources.get(id);
    if (!live) {
      throw new RuntimeError({
        code: "GGCS_RUNTIME_RESOURCE_UNAVAILABLE",
        category: "resource_unavailable",
        message: `Runtime resource ${id} is not live`,
        details: { resource: id, runtimeState: this.runtimeState },
      });
    }
    return live.resource as T;
  }

  resources(): readonly RuntimeResource[] {
    return [...this.liveResources.values()].map((entry) => entry.resource);
  }

  start(): Promise<void> {
    if (this.runtimeState === "running") return Promise.resolve();
    if (this.runtimeState === "starting" && this.startPromise) return this.startPromise;
    if (this.runtimeState === "stopping") {
      return Promise.reject(
        new RuntimeError({
          code: "GGCS_RUNTIME_START_WHILE_STOPPING",
          category: "runtime_lifecycle",
          message: "Cannot start Runtime while it is stopping",
        }),
      );
    }
    if (this.runtimeState === "stopped") {
      return Promise.reject(
        new RuntimeError({
          code: "GGCS_RUNTIME_RESTART_UNSUPPORTED",
          category: "runtime_lifecycle",
          message: "Stopped Runtime cannot be restarted in v0",
        }),
      );
    }
    if (this.runtimeState === "error") {
      return Promise.reject(
        new RuntimeError({
          code: "GGCS_RUNTIME_START_FROM_ERROR",
          category: "runtime_lifecycle",
          message: "Runtime in error state must be stopped and recreated",
        }),
      );
    }

    this.runtimeState = "starting";
    this.startPromise = (async () => {
      try {
        for (const prepared of this.options.orderedResources) {
          const provider = this.options.registry.resolveResourceProvider(prepared.provider);
          const live = await provider.create(prepared, {
            clock: this.options.clock,
            getResource: <T extends RuntimeResource = RuntimeResource>(id: ResourceId): T =>
              this.resource<T>(id),
          });
          if (live.resource.id !== prepared.id) {
            await live.dispose?.();
            throw new RuntimeError({
              code: "GGCS_PROVIDER_CREATE_IDENTITY",
              category: "provider_create",
              message: `Provider ${provider.id} created resource ${live.resource.id} for ${prepared.id}`,
            });
          }
          this.liveResources.set(prepared.id, live);
        }
        this.runtimeState = "running";
      } catch (error) {
        this.runtimeState = "error";
        await this.disposeLiveResources();
        throw asRuntimeError(error, {
          code: "GGCS_RUNTIME_START_FAILED",
          category: "provider_create",
          message: "Runtime failed while creating live resources",
        });
      }
    })();
    return this.startPromise;
  }

  stop(): Promise<void> {
    if (this.runtimeState === "stopped") return Promise.resolve();
    if (this.runtimeState === "stopping" && this.stopPromise) return this.stopPromise;

    this.stopPromise = (async () => {
      if (this.runtimeState === "starting" && this.startPromise) {
        try {
          await this.startPromise;
        } catch {
          // Start already transitioned to error and cleaned partial resources.
        }
      }
      if (this.runtimeState === "stopped") return;
      this.runtimeState = "stopping";
      try {
        await this.disposeLiveResources();
      } finally {
        this.runtimeState = "stopped";
      }
    })();
    return this.stopPromise;
  }

  private async disposeLiveResources(): Promise<void> {
    const orderedIds = this.options.orderedResources.map((resource) => resource.id).reverse();
    const errors: unknown[] = [];
    for (const id of orderedIds) {
      const live = this.liveResources.get(id);
      if (!live) continue;
      this.liveResources.delete(id);
      try {
        await live.dispose?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0 && this.runtimeState === "stopping") {
      throw new RuntimeError({
        code: "GGCS_RUNTIME_DISPOSE_FAILED",
        category: "runtime_lifecycle",
        message: `${errors.length} resource disposer(s) failed`,
        details: { count: errors.length },
        cause: errors[0],
      });
    }
  }
}
