// src/middleware/hooks/use-publisher.ts
import { useContext, useMemo } from "react";
import { Ctx } from "./common";
import { publisherBus } from "../publisher-bus";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

export function usePublisher(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePublisher must be used within <WidgetAttrProvider>");
  const runtimeCompatibility = useRuntimeCompatibility();

  return useMemo(() => {
    return (msg: any) => {
      if (runtimeCompatibility.mode === "compat-full") {
        throw new Error(`GGCS compat-full has no Runtime Command mapping for ${ctx.instanceId}::${attrName}`);
      }
      const fn = publisherBus.get(ctx.instanceId, attrName);
      if (!fn) {
        // No publisher configured for this attribute
        return;
      }
      fn(msg);
    };
  }, [ctx.instanceId, attrName, runtimeCompatibility.mode]);
}
