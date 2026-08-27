import type { ResourceId } from "@ggcs/schema";
import type { RuntimeResource } from "./resources.js";
import type { RuntimeClock, ScheduledTask } from "./clock.js";
import type { RuntimeError } from "./error.js";
import type {
  FreshObservation,
  LastGoodObservation,
  Observation,
  ObservationProvenance,
  StaleObservation,
} from "./observation.js";
import { isValueObservation } from "./observation.js";
import type { Subscription } from "./subscription.js";
import { createSubscription } from "./subscription.js";

export interface Source<T, Q = unknown> extends RuntimeResource {
  readonly kind: "source";
  readonly id: ResourceId;
  current(): Observation<T, Q>;
  subscribe(listener: (value: Observation<T, Q>) => void): Subscription;
}

export interface FreshnessPolicy {
  readonly staleAfterMs?: number;
}

export interface SourceValueMetadata<Q = unknown> {
  readonly sampleTime?: number;
  readonly quality?: Q;
  readonly provenance?: ObservationProvenance;
}

export interface SourceController<T, Q = unknown> {
  readonly source: Source<T, Q>;
  publish(value: T, metadata?: SourceValueMetadata<Q>): void;
  publishObservation(observation: Observation<T, Q>): void;
  unavailable(reason?: RuntimeError): void;
  fail(error: RuntimeError, preserveLastGood?: boolean): void;
  dispose(): void;
}

function notifySafely<T, Q>(
  listeners: ReadonlySet<(value: Observation<T, Q>) => void>,
  value: Observation<T, Q>,
): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      // A consumer failure must never break Source delivery to other consumers.
    }
  }
}

export function createSourceController<T, Q = unknown>(options: {
  readonly id: ResourceId;
  readonly clock: RuntimeClock;
  readonly freshness?: FreshnessPolicy;
}): SourceController<T, Q> {
  const listeners = new Set<(value: Observation<T, Q>) => void>();
  let current: Observation<T, Q> = {
    state: "unavailable",
    since: options.clock.wallNow(),
  };
  let lastGood: LastGoodObservation<T, Q> | undefined;
  let staleTask: ScheduledTask | undefined;
  let disposed = false;
  let generation = 0;

  const cancelStale = (): void => {
    staleTask?.cancel();
    staleTask = undefined;
  };

  const setCurrent = (next: Observation<T, Q>): void => {
    if (disposed) return;
    current = next;
    if (isValueObservation(next)) lastGood = next;
    notifySafely(listeners, next);
  };

  const armStale = (fresh: FreshObservation<T, Q>): void => {
    cancelStale();
    const staleAfterMs = options.freshness?.staleAfterMs;
    if (staleAfterMs === undefined || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) return;
    const thisGeneration = ++generation;
    staleTask = options.clock.schedule(staleAfterMs, () => {
      if (disposed || thisGeneration !== generation || current.state !== "fresh") return;
      const stale: StaleObservation<T, Q> = {
        ...fresh,
        state: "stale",
        staleSince: options.clock.wallNow(),
      };
      setCurrent(stale);
    });
  };

  const source: Source<T, Q> = {
    kind: "source",
    id: options.id,
    current(): Observation<T, Q> {
      return current;
    },
    subscribe(listener: (value: Observation<T, Q>) => void): Subscription {
      if (disposed) {
        listener(current);
        return createSubscription(() => undefined);
      }
      listeners.add(listener);
      try {
        listener(current);
      } catch {
        // Same isolation guarantee as normal updates.
      }
      return createSubscription(() => listeners.delete(listener));
    },
  };

  return {
    source,
    publish(value: T, metadata?: SourceValueMetadata<Q>): void {
      if (disposed) return;
      const next: FreshObservation<T, Q> = {
        state: "fresh",
        value,
        updatedAt: options.clock.wallNow(),
        ...(metadata?.sampleTime !== undefined ? { sampleTime: metadata.sampleTime } : {}),
        ...(metadata?.quality !== undefined ? { quality: metadata.quality } : {}),
        ...(metadata?.provenance !== undefined ? { provenance: metadata.provenance } : {}),
      };
      setCurrent(next);
      armStale(next);
    },
    publishObservation(observation: Observation<T, Q>): void {
      if (disposed) return;
      cancelStale();
      generation += 1;
      setCurrent(observation);
      if (observation.state === "fresh") armStale(observation);
    },
    unavailable(reason?: RuntimeError): void {
      if (disposed) return;
      cancelStale();
      generation += 1;
      setCurrent({
        state: "unavailable",
        since: options.clock.wallNow(),
        ...(reason !== undefined ? { reason } : {}),
      });
    },
    fail(error: RuntimeError, preserveLastGood = true): void {
      if (disposed) return;
      cancelStale();
      generation += 1;
      setCurrent({
        state: "error",
        error,
        occurredAt: options.clock.wallNow(),
        ...(preserveLastGood && lastGood !== undefined ? { lastGood } : {}),
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelStale();
      listeners.clear();
    },
  };
}
