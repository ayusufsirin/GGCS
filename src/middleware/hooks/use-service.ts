import { useContext, useMemo, useState } from "react";
import type { Procedure } from "@ggcs/core";
import { Ctx } from "./common";
import { serviceBus, svcKey } from "../service-bus";
import { backendUsesRuntimeForActions } from "../../runtime/backend-mode";
import { isM04Slice4RuntimeProcedurePort } from "../../runtime/compatibility-map";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

function useService<TReq = any, TRes = any>(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useService must be used within <WidgetAttrProvider>");

  const runtimeCompatibility = useRuntimeCompatibility();
  const key = useMemo(() => svcKey(ctx.instanceId, attrName), [ctx.instanceId, attrName]);
  const runtimeAction =
    backendUsesRuntimeForActions(runtimeCompatibility.mode) &&
    isM04Slice4RuntimeProcedurePort(ctx.instanceId, attrName);

  const fullModeUnmapped = runtimeCompatibility.mode === "compat-full" && !runtimeAction;

  const runtimeProcedure = runtimeAction
    ? runtimeCompatibility.resourceForPort<Procedure<TReq, TRes>>(ctx.instanceId, attrName)
    : undefined;

  // A cut-over action must never silently fall back to the legacy service bus.
  // Rollback is explicit backend mode selection plus process/page restart.
  if (runtimeAction && (!runtimeProcedure || runtimeProcedure.kind !== "procedure")) {
    throw new Error(
      `GGCS compat action Procedure unavailable for ${ctx.instanceId}::${attrName}`,
    );
  }
  if (fullModeUnmapped) {
    throw new Error(`GGCS compat-full has no Runtime Procedure mapping for ${ctx.instanceId}::${attrName}`);
  }

  return useMemo(
    () => (req: TReq, opts?: { timeoutMs?: number }) => {
      if (runtimeAction) {
        // Runtime Procedure timeout policy belongs to its compiled definition.
        // The legacy per-call opts shape remains for non-migrated services only.
        return runtimeProcedure!.invoke(req).result();
      }
      return serviceBus.call<TRes>(key, req, opts);
    },
    [key, runtimeAction, runtimeProcedure],
  );
}

export function useServiceCall<TReq = any, TRes = any>(attrName: string) {
  const callRaw = useService<TReq, TRes>(attrName);
  const [pendingCount, setPendingCount] = useState(0);
  const [data, setData] = useState<TRes | undefined>();
  const [error, setError] = useState<Error | undefined>();

  async function call(req: TReq, opts?: { timeoutMs?: number }) {
    setPendingCount((count) => count + 1);
    setError(undefined);
    try {
      const res = await callRaw(req, opts);
      setData(res);
      return res;
    } catch (e: any) {
      setError(e);
      throw e;
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }

  return { call, pending: pendingCount > 0, data, error };
}
