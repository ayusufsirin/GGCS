import type { RuntimeError } from "./error.js";

export interface ObservationProvenance {
  readonly resourceIds?: readonly string[];
  readonly note?: string;
}

export interface UnavailableObservation {
  readonly state: "unavailable";
  readonly since?: number;
  readonly reason?: RuntimeError;
}

export interface FreshObservation<T, Q = unknown> {
  readonly state: "fresh";
  readonly value: T;
  readonly updatedAt: number;
  readonly sampleTime?: number;
  readonly quality?: Q;
  readonly provenance?: ObservationProvenance;
}

export interface StaleObservation<T, Q = unknown> {
  readonly state: "stale";
  readonly value: T;
  readonly updatedAt: number;
  readonly staleSince: number;
  readonly sampleTime?: number;
  readonly quality?: Q;
  readonly provenance?: ObservationProvenance;
}

export type LastGoodObservation<T, Q = unknown> =
  | FreshObservation<T, Q>
  | StaleObservation<T, Q>;

export interface ErrorObservation<T, Q = unknown> {
  readonly state: "error";
  readonly error: RuntimeError;
  readonly occurredAt: number;
  readonly lastGood?: LastGoodObservation<T, Q>;
}

export type Observation<T, Q = unknown> =
  | UnavailableObservation
  | FreshObservation<T, Q>
  | StaleObservation<T, Q>
  | ErrorObservation<T, Q>;

export function isValueObservation<T, Q>(
  value: Observation<T, Q>,
): value is FreshObservation<T, Q> | StaleObservation<T, Q> {
  return value.state === "fresh" || value.state === "stale";
}
