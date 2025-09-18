// src/middleware/hooks/use-publisher.ts
import { useContext, useMemo } from "react";
import { Ctx } from "./common";
import { publisherBus } from "../publisher-bus";

export function usePublisher(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePublisher must be used within <WidgetAttrProvider>");

  return useMemo(() => {
    return (msg: any) => {
      const fn = publisherBus.get(ctx.instanceId, attrName);
      console.log("usePublisher", ctx.instanceId, attrName, msg, fn);
      if (!fn) {
        // No publisher configured for this attribute
        return;
      }
      fn(msg);
    };
  }, [ctx.instanceId, attrName]);
}
