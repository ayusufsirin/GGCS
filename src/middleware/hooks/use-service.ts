import { useContext, useMemo, useState } from "react";
import { Ctx } from "./common";
import { serviceBus, svcKey } from "../service-bus";

function useService<TReq = any, TRes = any>(attrName: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useService must be used within <WidgetAttrProvider>");
  const key = useMemo(() => svcKey(ctx.instanceId, attrName), [ctx.instanceId, attrName]);

  return useMemo(
    () => (req: TReq, opts?: { timeoutMs?: number }) => serviceBus.call<TRes>(key, req, opts),
    [key]
  );
}

export function useServiceCall<TReq = any, TRes = any>(attrName: string) {
  const callRaw = useService<TReq, TRes>(attrName);
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<TRes | undefined>();
  const [error, setError] = useState<Error | undefined>();

  async function call(req: TReq, opts?: { timeoutMs?: number }) {
    setPending(true);
    setError(undefined);
    try {
      const res = await callRaw(req, opts);
      setData(res);
      return res;
    } catch (e: any) {
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }

  return { call, pending, data, error };
}
