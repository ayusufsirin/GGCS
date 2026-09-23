import { useContext, useMemo, useState } from "react";
import type { Procedure } from "@ggcs/core";
import { Ctx } from "./common";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

function useService<TReq = any, TRes = any>(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useService must be used within <WidgetAttrProvider>");

  const runtimeCompatibility = useRuntimeCompatibility();
  const binding = runtimeCompatibility.resolvePort(ctx.instanceId, attrName);
  if (!binding || binding.kind !== "procedure") {
    throw new Error(`GGCS has no Runtime Procedure mapping for ${ctx.instanceId}::${attrName}`);
  }

  const runtimeProcedure = runtimeCompatibility.resourceForPort<Procedure<TReq, TRes>>(
    ctx.instanceId,
    attrName,
  );
  if (!runtimeProcedure || runtimeProcedure.kind !== "procedure") {
    throw new Error(`GGCS Runtime Procedure unavailable for ${ctx.instanceId}::${attrName}`);
  }

  return useMemo(
    () => (req: TReq, _opts?: { timeoutMs?: number }) => runtimeProcedure.invoke(req).result(),
    [runtimeProcedure],
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
