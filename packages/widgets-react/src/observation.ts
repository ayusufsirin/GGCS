export type RendererObservation<T> =
  | { readonly state: "unavailable" }
  | { readonly state: "fresh"; readonly value: T }
  | { readonly state: "stale"; readonly value: T }
  | { readonly state: "error"; readonly lastGood?: { readonly value: T } };

export interface DisplayObservation<T> {
  readonly state: RendererObservation<T>["state"];
  readonly value: T | undefined;
  readonly label: "Fresh" | "Stale" | "Unavailable" | "Error";
}

/** Preserve runtime state while exposing last-good values for degraded rendering. */
export function displayObservation<T>(observation: RendererObservation<T> | undefined): DisplayObservation<T> {
  if (!observation || observation.state === "unavailable") {
    return { state: "unavailable", value: undefined, label: "Unavailable" };
  }
  if (observation.state === "fresh") {
    return { state: "fresh", value: observation.value, label: "Fresh" };
  }
  if (observation.state === "stale") {
    return { state: "stale", value: observation.value, label: "Stale" };
  }
  return {
    state: "error",
    value: observation.lastGood?.value,
    label: "Error",
  };
}
