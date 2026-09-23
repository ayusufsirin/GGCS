import { useContext, useMemo } from "react";
import type { Command } from "@ggcs/core";
import { Ctx } from "./common";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

/** Temporary compatibility hook; final semantic widgets use a command port hook. */
export function usePublisher<T = any>(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePublisher must be used within <WidgetAttrProvider>");
  const runtimeCompatibility = useRuntimeCompatibility();

  const binding = runtimeCompatibility.resolvePort(ctx.instanceId, attrName);
  const command = binding?.kind === "command"
    ? runtimeCompatibility.resourceForPort<Command<T>>(ctx.instanceId, attrName)
    : undefined;

  if (binding?.kind === "command" && (!command || command.kind !== "command")) {
    throw new Error(`GGCS Runtime Command unavailable for ${ctx.instanceId}::${attrName}`);
  }

  return useMemo(() => (msg: T) => {
    if (!binding || binding.kind !== "command" || !command) {
      throw new Error(`GGCS has no Runtime Command mapping for ${ctx.instanceId}::${attrName}`);
    }
    return command.send(msg);
  }, [attrName, binding, command, ctx.instanceId]);
}
