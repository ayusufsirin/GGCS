import type {
  BaseResourceDefinition,
  ComputationId,
  ResourceId,
  TypeId,
} from "@ggcs/schema";
import type { RuntimeClock } from "./clock.js";
import { RuntimeError, asRuntimeError } from "./error.js";
import type { Observation } from "./observation.js";
import type {
  PreparedResourceDefinition,
  ProviderPrepareContext,
  ResourceCreateContext,
  ResourceProvider,
} from "./provider.js";
import type { RuntimeResource } from "./resources.js";
import { createSourceController, type Source } from "./source.js";
import type { Subscription } from "./subscription.js";

export interface ComputationContext {
  readonly clock: RuntimeClock;
  readonly inputs: Readonly<Record<string, Observation<unknown>>>;
}

export interface ComputationInstance<T> {
  compute(context: ComputationContext): Observation<T>;
  dispose?(): void;
}

export interface ComputationRegistration<T> {
  readonly id: ComputationId;
  readonly inputs: Readonly<Record<string, TypeId>>;
  readonly output: TypeId;
  create(): ComputationInstance<T>;
}

export interface ValueTransformRegistration<I, O> {
  readonly id: ComputationId;
  readonly input: TypeId;
  readonly output: TypeId;
  transform(value: I): O;
}

export function defineValueTransform<I, O>(
  registration: ValueTransformRegistration<I, O>,
): ComputationRegistration<O> {
  return {
    id: registration.id,
    inputs: { input: registration.input },
    output: registration.output,
    create(): ComputationInstance<O> {
      return {
        compute(context: ComputationContext): Observation<O> {
          const input = context.inputs.input as Observation<I> | undefined;
          if (input === undefined) {
            return {
              state: "error",
              error: new RuntimeError({
                code: "GGCS_COMPUTATION_INPUT_MISSING",
                category: "computation_failure",
                message: `Transform ${registration.id} did not receive its input`,
              }),
              occurredAt: context.clock.wallNow(),
            };
          }
          if (input.state === "unavailable") return input;
          if (input.state === "error") {
            return {
              state: "error",
              error: input.error,
              occurredAt: input.occurredAt,
            };
          }
          try {
            const value = registration.transform(input.value);
            if (input.state === "stale") {
              return {
                state: "stale",
                value,
                updatedAt: input.updatedAt,
                staleSince: input.staleSince,
                ...(input.sampleTime !== undefined ? { sampleTime: input.sampleTime } : {}),
                ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
              };
            }
            return {
              state: "fresh",
              value,
              updatedAt: input.updatedAt,
              ...(input.sampleTime !== undefined ? { sampleTime: input.sampleTime } : {}),
              ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
            };
          } catch (error) {
            return {
              state: "error",
              error: asRuntimeError(error, {
                code: "GGCS_COMPUTATION_FAILED",
                category: "computation_failure",
                message: `Transform ${registration.id} failed`,
              }),
              occurredAt: context.clock.wallNow(),
            };
          }
        },
      };
    },
  };
}

interface DerivedPrepared {
  readonly computation: ComputationRegistration<unknown>;
  readonly inputs: Readonly<Record<string, ResourceId>>;
}

class DerivedSource<T> implements Source<T>, RuntimeResource {
  readonly kind = "source" as const;
  constructor(private readonly inner: Source<T>) {}
  get id(): ResourceId {
    return this.inner.id;
  }
  current(): Observation<T> {
    return this.inner.current();
  }
  subscribe(listener: (value: Observation<T>) => void): Subscription {
    return this.inner.subscribe(listener);
  }
}

export const DERIVED_PROVIDER_ID = "ggcs:derived";

export const derivedResourceProvider: ResourceProvider<DerivedPrepared> = {
  id: DERIVED_PROVIDER_ID,
  prepare(
    definition: BaseResourceDefinition,
    context: ProviderPrepareContext,
  ): PreparedResourceDefinition<DerivedPrepared> {
    const config = context.assertObjectConfig(definition, {
      allowed: ["computation", "inputs"],
      required: ["computation", "inputs"],
    });
    const computationId = config.computation;
    const inputsValue = config.inputs;
    if (typeof computationId !== "string" || inputsValue === null || typeof inputsValue !== "object" || Array.isArray(inputsValue)) {
      throw new RuntimeError({
        code: "GGCS_DERIVED_CONFIG_INVALID",
        category: "configuration",
        message: `Derived resource ${definition.id} requires string computation and object inputs`,
      });
    }
    const computation = context.resolveComputation(computationId);
    if (definition.type !== computation.output) {
      throw new RuntimeError({
        code: "GGCS_DERIVED_OUTPUT_TYPE_MISMATCH",
        category: "configuration",
        message: `Derived resource ${definition.id} declares ${definition.type} but computation ${computation.id} outputs ${computation.output}`,
      });
    }
    const inputs: Record<string, ResourceId> = {};
    for (const [port, expectedType] of Object.entries(computation.inputs)) {
      const resourceId = (inputsValue as Record<string, unknown>)[port];
      if (typeof resourceId !== "string") {
        throw new RuntimeError({
          code: "GGCS_DERIVED_INPUT_MISSING",
          category: "configuration",
          message: `Derived resource ${definition.id} is missing input port ${port}`,
        });
      }
      const actualType = context.resourceType(resourceId);
      if (actualType !== expectedType) {
        throw new RuntimeError({
          code: "GGCS_DERIVED_INPUT_TYPE_MISMATCH",
          category: "configuration",
          message: `Input ${port} of ${definition.id} expects ${expectedType} but ${resourceId} is ${actualType}`,
          details: { resourceId: definition.id, port, dependency: resourceId, expectedType, actualType },
        });
      }
      inputs[port] = resourceId;
    }
    for (const port of Object.keys(inputsValue as Record<string, unknown>)) {
      if (!(port in computation.inputs)) {
        throw new RuntimeError({
          code: "GGCS_DERIVED_INPUT_UNKNOWN",
          category: "configuration",
          message: `Derived resource ${definition.id} has unknown input port ${port}`,
        });
      }
    }
    return {
      id: definition.id,
      provider: DERIVED_PROVIDER_ID,
      type: definition.type,
      dependencies: Object.values(inputs),
      prepared: { computation, inputs },
    };
  },
  create(
    definition: PreparedResourceDefinition<DerivedPrepared>,
    context: ResourceCreateContext,
  ) {
    const computation = definition.prepared.computation.create();
    const controller = createSourceController<unknown>({
      id: definition.id,
      clock: context.clock,
    });
    const observations: Record<string, Observation<unknown>> = {};
    const subscriptions: Subscription[] = [];
    let initialized = false;

    const recompute = (): void => {
      if (!initialized) return;
      try {
        controller.publishObservation(
          computation.compute({ clock: context.clock, inputs: { ...observations } }),
        );
      } catch (error) {
        controller.fail(
          asRuntimeError(error, {
            code: "GGCS_COMPUTATION_FAILED",
            category: "computation_failure",
            message: `Computation ${definition.prepared.computation.id} failed for ${definition.id}`,
          }),
        );
      }
    };

    for (const [port, resourceId] of Object.entries(definition.prepared.inputs)) {
      const source = context.getResource<Source<unknown> & RuntimeResource>(resourceId);
      const subscription = source.subscribe((observation) => {
        observations[port] = observation;
        recompute();
      });
      subscriptions.push(subscription);
    }
    initialized = true;
    recompute();

    return {
      resource: new DerivedSource(controller.source),
      dispose(): void {
        for (const subscription of subscriptions) subscription.unsubscribe();
        computation.dispose?.();
        controller.dispose();
      },
    };
  },
};
