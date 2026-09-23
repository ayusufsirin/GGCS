import { useContext, useEffect, useState } from "react";
import type { Observation, Source } from "@ggcs/core";
import { Ctx } from "./common";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

/**
 * Temporary projection for React widgets that have not yet moved to the final
 * Observation-aware renderer hooks. Fresh/stale retain values, last-good is
 * preserved for errors, and unavailable falls back to the supplied initial.
 */
export function projectObservationToLegacyValue<T>(
  observation: Observation<T>,
  initial?: T,
): T | undefined {
  if (observation.state === "fresh" || observation.state === "stale") {
    return observation.value;
  }
  if (observation.state === "error" && observation.lastGood) {
    return observation.lastGood.value;
  }
  return initial;
}

/** Widgets call this with the attribute name declared by the migration map. */
export function useAttr<T = any>(attrName: string, initial?: T) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttr must be used within <WidgetAttrProvider>");

  const runtimeCompatibility = useRuntimeCompatibility();
  const binding = runtimeCompatibility.resolvePort(ctx.instanceId, attrName);
  if (binding && binding.kind !== "source") {
    throw new Error(`GGCS port ${ctx.instanceId}::${attrName} is not a Source`);
  }

  const runtimeSource = binding
    ? runtimeCompatibility.resourceForPort<Source<T>>(ctx.instanceId, attrName)
    : undefined;

  if (binding && (!runtimeSource || runtimeSource.kind !== "source")) {
    throw new Error(`GGCS Runtime Source unavailable for ${ctx.instanceId}::${attrName}`);
  }

  const [val, setVal] = useState<T | undefined>(initial);

  useEffect(() => {
    // Unbound attrs are optional compatibility inputs/local visual defaults.
    // Critically, they no longer fall back to any singleton middleware store.
    if (!runtimeSource) {
      setVal(initial);
      return;
    }

    const subscription = runtimeSource.subscribe((observation) => {
      setVal(projectObservationToLegacyValue(observation, initial));
    });
    return () => subscription.unsubscribe();
  }, [initial, runtimeSource]);

  return val;
}
