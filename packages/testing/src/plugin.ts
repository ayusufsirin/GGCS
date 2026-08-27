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
  type PreparedResourceDefinition,
  type Procedure,
  type ProviderPrepareContext,
  type ResourceCreateContext,
  type ResourceProvider,
  type RuntimeResource,
  type Source,
  type SourceController,
} from "@ggcs/core";
import { definePlugin } from "@ggcs/plugin-sdk";
import {
  CORE_TYPE_IDS,
  type BaseResourceDefinition,
  type ParameterDescriptor,
  type ParameterQuery,
  type ResourceId,
  type TypeDescriptor,
} from "@ggcs/schema";

export const TEST_PROVIDER_IDS = {
  source: "testing:source",
  command: "testing:command",
  procedure: "testing:procedure",
  parameterProvider: "testing:parameter-provider",
} as const;

export interface TestLifecycleEvent {
  readonly phase: "prepare" | "create" | "dispose";
  readonly resourceId: ResourceId;
}

function dependenciesFrom(config: Readonly<Record<string, unknown>>): readonly ResourceId[] {
  const value = config.dependsOn;
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new RuntimeError({
      code: "TEST_DEPENDENCIES_INVALID",
      category: "configuration",
      message: "testing provider dependsOn must be a string array",
    });
  }
  return value;
}

export class TestSource<T> implements Source<T>, RuntimeResource {
  readonly kind = "source" as const;
  constructor(
    readonly id: ResourceId,
    private readonly controller: SourceController<T>,
  ) {}
  current() {
    return this.controller.source.current();
  }
  subscribe(listener: Parameters<Source<T>["subscribe"]>[0]) {
    return this.controller.source.subscribe(listener);
  }
  emit(value: T): void {
    this.controller.publish(value);
  }
  setUnavailable(error?: RuntimeError): void {
    this.controller.unavailable(error);
  }
  setError(error: RuntimeError): void {
    this.controller.fail(error);
  }
}

export class TestCommand<T> implements Command<T> {
  readonly kind = "command" as const;
  readonly sent: T[] = [];
  failNext: RuntimeError | undefined;
  constructor(readonly id: ResourceId, private readonly context: ResourceCreateContext) {}
  async send(value: T): Promise<CommandDispatchReceipt> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
    this.sent.push(value);
    return { dispatchedAt: this.context.clock.wallNow() };
  }
}

interface ProcedurePrepared {
  readonly dependencies: readonly ResourceId[];
  readonly result: unknown;
  readonly delayMs: number;
  readonly timeoutMs?: number;
  readonly fail: boolean;
}

export class TestProcedure<I, O> implements Procedure<I, O> {
  readonly kind = "procedure" as const;
  readonly calls: I[] = [];
  constructor(
    readonly id: ResourceId,
    private readonly context: ResourceCreateContext,
    private readonly prepared: ProcedurePrepared,
  ) {}
  invoke(input: I): Invocation<O> {
    this.calls.push(input);
    const controller = createInvocationController<O>({
      clock: this.context.clock,
      ...(this.prepared.timeoutMs !== undefined ? { timeoutMs: this.prepared.timeoutMs } : {}),
    });
    this.context.clock.schedule(this.prepared.delayMs, () => {
      if (this.prepared.fail) {
        controller.fail(
          new RuntimeError({
            code: "TEST_PROCEDURE_FAILURE",
            category: "invocation_failure",
            message: `Test procedure ${this.id} failed`,
          }),
        );
      } else {
        controller.succeed(this.prepared.result as O);
      }
    });
    return controller.invocation;
  }
}

interface TestParameterSpec {
  readonly id: ResourceId;
  readonly descriptor: ParameterDescriptor<unknown>;
  readonly initial: unknown;
}

export class TestParameter<T> implements Parameter<T> {
  readonly kind = "parameter" as const;
  readonly value: Source<T>;
  private readonly controller: SourceController<T>;
  private currentValue: T;

  constructor(
    readonly id: ResourceId,
    readonly descriptor: ParameterDescriptor<T>,
    initial: T,
    private readonly context: ResourceCreateContext,
  ) {
    this.currentValue = initial;
    this.controller = createSourceController<T>({ id: `${id}:value`, clock: context.clock });
    this.controller.publish(initial);
    this.value = this.controller.source;
  }

  refresh(): Invocation<T> {
    const invocation = createInvocationController<T>({ clock: this.context.clock });
    this.context.clock.schedule(0, () => {
      this.controller.publish(this.currentValue);
      invocation.succeed(this.currentValue);
    });
    return invocation.invocation;
  }

  write(value: T): Invocation<void> {
    const invocation = createInvocationController<void>({ clock: this.context.clock });
    this.context.clock.schedule(0, () => {
      if (!this.descriptor.writable) {
        invocation.fail(
          new RuntimeError({
            code: "GGCS_PARAMETER_READ_ONLY",
            category: "parameter_write",
            message: `Parameter ${this.id} is read-only`,
          }),
        );
        return;
      }
      const constraints = this.descriptor.constraints;
      if (typeof value === "number") {
        if (constraints?.minimum !== undefined && value < constraints.minimum) {
          invocation.fail(
            new RuntimeError({
              code: "GGCS_PARAMETER_MINIMUM",
              category: "parameter_validation",
              message: `Parameter ${this.id} must be >= ${constraints.minimum}`,
            }),
          );
          return;
        }
        if (constraints?.maximum !== undefined && value > constraints.maximum) {
          invocation.fail(
            new RuntimeError({
              code: "GGCS_PARAMETER_MAXIMUM",
              category: "parameter_validation",
              message: `Parameter ${this.id} must be <= ${constraints.maximum}`,
            }),
          );
          return;
        }
      }
      this.currentValue = value;
      this.controller.publish(value);
      invocation.succeed(undefined);
    });
    return invocation.invocation;
  }

  dispose(): void {
    this.controller.dispose();
  }
}

export class TestParameterProvider implements ParameterProvider {
  readonly kind = "parameter_provider" as const;
  private readonly parameters = new Map<ResourceId, TestParameter<unknown>>();

  constructor(
    readonly id: ResourceId,
    specs: readonly TestParameterSpec[],
    context: ResourceCreateContext,
  ) {
    for (const spec of specs) {
      this.parameters.set(
        spec.id,
        new TestParameter(spec.id, spec.descriptor, spec.initial, context),
      );
    }
  }

  async list(query?: ParameterQuery): Promise<readonly ParameterDescriptor<unknown>[]> {
    return [...this.parameters.values()]
      .map((parameter) => parameter.descriptor)
      .filter((descriptor) =>
        (query?.prefix === undefined || descriptor.id.startsWith(query.prefix)) &&
        (query?.writable === undefined || descriptor.writable === query.writable),
      );
  }

  async resolve<T = unknown>(id: ResourceId): Promise<Parameter<T>> {
    const parameter = this.parameters.get(id);
    if (!parameter) {
      throw new RuntimeError({
        code: "TEST_PARAMETER_UNKNOWN",
        category: "resource_unavailable",
        message: `Unknown test parameter ${id}`,
      });
    }
    return parameter as TestParameter<T>;
  }

  dispose(): void {
    for (const parameter of this.parameters.values()) parameter.dispose();
  }
}

export function createTestingPlugin(): {
  readonly plugin: ReturnType<typeof definePlugin>;
  readonly events: TestLifecycleEvent[];
} {
  const events: TestLifecycleEvent[] = [];

  const sourceProvider: ResourceProvider<{ readonly dependencies: readonly ResourceId[]; readonly staleAfterMs?: number; readonly initial?: unknown }> = {
    id: TEST_PROVIDER_IDS.source,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["dependsOn", "staleAfterMs", "initial"],
      });
      if (config.staleAfterMs !== undefined && (typeof config.staleAfterMs !== "number" || config.staleAfterMs < 0)) {
        throw new RuntimeError({
          code: "TEST_STALE_AFTER_INVALID",
          category: "configuration",
          message: `Resource ${definition.id} staleAfterMs must be a non-negative number`,
        });
      }
      events.push({ phase: "prepare", resourceId: definition.id });
      return {
        id: definition.id,
        provider: TEST_PROVIDER_IDS.source,
        type: definition.type,
        dependencies: dependenciesFrom(config),
        prepared: {
          dependencies: dependenciesFrom(config),
          ...(typeof config.staleAfterMs === "number" ? { staleAfterMs: config.staleAfterMs } : {}),
          ...(Object.prototype.hasOwnProperty.call(config, "initial") ? { initial: config.initial } : {}),
        },
      };
    },
    create(definition, context): LiveResource {
      events.push({ phase: "create", resourceId: definition.id });
      const controller = createSourceController<unknown>({
        id: definition.id,
        clock: context.clock,
        ...(definition.prepared.staleAfterMs !== undefined
          ? { freshness: { staleAfterMs: definition.prepared.staleAfterMs } }
          : {}),
      });
      const resource = new TestSource(definition.id, controller);
      if (Object.prototype.hasOwnProperty.call(definition.prepared, "initial")) {
        resource.emit(definition.prepared.initial);
      }
      return {
        resource,
        dispose(): void {
          events.push({ phase: "dispose", resourceId: definition.id });
          controller.dispose();
        },
      };
    },
  };

  const commandProvider: ResourceProvider<{ readonly dependencies: readonly ResourceId[] }> = {
    id: TEST_PROVIDER_IDS.command,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, { allowed: ["dependsOn"] });
      events.push({ phase: "prepare", resourceId: definition.id });
      return {
        id: definition.id,
        provider: TEST_PROVIDER_IDS.command,
        type: definition.type,
        dependencies: dependenciesFrom(config),
        prepared: { dependencies: dependenciesFrom(config) },
      };
    },
    create(definition, context): LiveResource {
      events.push({ phase: "create", resourceId: definition.id });
      return {
        resource: new TestCommand(definition.id, context),
        dispose(): void {
          events.push({ phase: "dispose", resourceId: definition.id });
        },
      };
    },
  };

  const procedureProvider: ResourceProvider<ProcedurePrepared> = {
    id: TEST_PROVIDER_IDS.procedure,
    prepare(definition, context) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["dependsOn", "result", "delayMs", "timeoutMs", "fail"],
      });
      const delayMs = typeof config.delayMs === "number" ? config.delayMs : 0;
      const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : undefined;
      const fail = config.fail === true;
      events.push({ phase: "prepare", resourceId: definition.id });
      return {
        id: definition.id,
        provider: TEST_PROVIDER_IDS.procedure,
        type: definition.type,
        dependencies: dependenciesFrom(config),
        prepared: {
          dependencies: dependenciesFrom(config),
          result: config.result,
          delayMs,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          fail,
        },
      };
    },
    create(definition, context): LiveResource {
      events.push({ phase: "create", resourceId: definition.id });
      return {
        resource: new TestProcedure(definition.id, context, definition.prepared),
        dispose(): void {
          events.push({ phase: "dispose", resourceId: definition.id });
        },
      };
    },
  };

  const parameterProvider: ResourceProvider<{ readonly specs: readonly TestParameterSpec[]; readonly dependencies: readonly ResourceId[] }> = {
    id: TEST_PROVIDER_IDS.parameterProvider,
    prepare(definition: BaseResourceDefinition, context: ProviderPrepareContext) {
      const config = context.assertObjectConfig(definition, {
        allowed: ["dependsOn", "parameters"],
        required: ["parameters"],
      });
      if (!Array.isArray(config.parameters)) {
        throw new RuntimeError({
          code: "TEST_PARAMETERS_INVALID",
          category: "configuration",
          message: `Resource ${definition.id} parameters must be an array`,
        });
      }
      const specs: TestParameterSpec[] = config.parameters.map((raw, index) => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
          throw new RuntimeError({
            code: "TEST_PARAMETER_SPEC_INVALID",
            category: "configuration",
            message: `Parameter entry ${index} must be an object`,
          });
        }
        const entry = raw as Record<string, unknown>;
        const allowed = new Set(["id", "type", "writable", "initial", "defaultValue", "minimum", "maximum", "description", "unit"]);
        for (const key of Object.keys(entry)) {
          if (!allowed.has(key)) {
            throw new RuntimeError({
              code: "TEST_PARAMETER_FIELD_UNKNOWN",
              category: "schema",
              message: `Parameter entry ${index} has unknown field ${key}`,
            });
          }
        }
        if (typeof entry.id !== "string" || typeof entry.type !== "string" || typeof entry.writable !== "boolean") {
          throw new RuntimeError({
            code: "TEST_PARAMETER_SPEC_INVALID",
            category: "configuration",
            message: `Parameter entry ${index} requires id, type, writable`,
          });
        }
        const type = context.resolveType(entry.type) as TypeDescriptor<unknown>;
        const descriptor: ParameterDescriptor<unknown> = {
          id: entry.id,
          type,
          writable: entry.writable,
          ...(typeof entry.description === "string" ? { description: entry.description } : {}),
          ...(typeof entry.unit === "string" ? { unit: entry.unit } : {}),
          ...(Object.prototype.hasOwnProperty.call(entry, "defaultValue") ? { defaultValue: entry.defaultValue } : {}),
          ...((typeof entry.minimum === "number" || typeof entry.maximum === "number")
            ? {
                constraints: {
                  ...(typeof entry.minimum === "number" ? { minimum: entry.minimum } : {}),
                  ...(typeof entry.maximum === "number" ? { maximum: entry.maximum } : {}),
                },
              }
            : {}),
        };
        return { id: entry.id, descriptor, initial: entry.initial };
      });
      events.push({ phase: "prepare", resourceId: definition.id });
      return {
        id: definition.id,
        provider: TEST_PROVIDER_IDS.parameterProvider,
        type: definition.type,
        dependencies: dependenciesFrom(config),
        prepared: { specs, dependencies: dependenciesFrom(config) },
      };
    },
    create(definition, context): LiveResource {
      events.push({ phase: "create", resourceId: definition.id });
      const resource = new TestParameterProvider(definition.id, definition.prepared.specs, context);
      return {
        resource,
        dispose(): void {
          events.push({ phase: "dispose", resourceId: definition.id });
          resource.dispose();
        },
      };
    },
  };

  return {
    events,
    plugin: definePlugin({
      manifest: {
        id: "testing:plugin",
        version: "0.1.0",
        ggcsApi: "^0.1.0",
      },
      resourceProviders: [sourceProvider, commandProvider, procedureProvider, parameterProvider],
      types: [
        {
          id: "testing:type/command",
          schema: {},
          compatibleWith: [CORE_TYPE_IDS.unknown],
        },
        {
          id: "testing:type/procedure",
          schema: {},
          compatibleWith: [CORE_TYPE_IDS.unknown],
        },
      ],
    }),
  };
}
