import { useContext, useEffect, useState } from "react";
import type { Observation, Source } from "@ggcs/core";
import { instanceStore } from "../instance-store";
import { Ctx } from "./common";
import { backendUsesRuntimeForTelemetry } from "../../runtime/backend-mode";
import { isM04Slice3RuntimeReadPort } from "../../runtime/compatibility-map";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

/**
 * Project the richer GGCS Observation envelope back into the naked value shape
 * expected by legacy widgets during M04 compatibility.
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

/** Widgets call this with just the attribute name declared in their spec. */
export function useAttr<T = any>(attrName: string, initial?: T) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttr must be used within <WidgetAttrProvider>");

  const runtimeCompatibility = useRuntimeCompatibility();
  const runtimeRead =
    backendUsesRuntimeForTelemetry(runtimeCompatibility.mode) &&
    isM04Slice3RuntimeReadPort(ctx.instanceId, attrName);

  const runtimeSource = runtimeRead
    ? runtimeCompatibility.resourceForPort<Source<T>>(ctx.instanceId, attrName)
    : undefined;

  // Authoritative compatibility modes never silently fall back to legacy for a
  // port that has been explicitly cut over. Rollback is mode selection + restart.
  if (runtimeRead && (!runtimeSource || runtimeSource.kind !== "source")) {
    throw new Error(
      `GGCS compat-read source unavailable for ${ctx.instanceId}::${attrName}`,
    );
  }

  const [val, setVal] = useState<T | undefined>(initial);

  useEffect(() => {
    if (runtimeRead) {
      const subscription = runtimeSource!.subscribe((observation) => {
        setVal(projectObservationToLegacyValue(observation, initial));
      });
      return () => subscription.unsubscribe();
    }

    return instanceStore.on<T>(ctx.instanceId, attrName, setVal);
  }, [ctx.instanceId, attrName, initial, runtimeRead, runtimeSource]);

  return val;
}
