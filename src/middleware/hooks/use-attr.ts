import {useContext, useEffect, useState } from "react";
import { instanceStore } from "../instance-store";
import { Ctx } from "./common";

/** Widgets call this with just the attribute name declared in their spec */
export function useAttr<T = any>(attrName: string, initial?: T) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttr must be used within <WidgetAttrProvider>");
  const [val, setVal] = useState<T | undefined>(initial);
  useEffect(() => instanceStore.on<T>(ctx.instanceId, attrName, setVal), [ctx.instanceId, attrName]);
  return val;
}
