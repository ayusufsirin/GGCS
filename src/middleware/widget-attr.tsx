// widget-attr.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { instanceStore } from "./instance-store";

const Ctx = createContext<{ instanceId: string } | null>(null);

export function WidgetAttrProvider(props: { instanceId: string; children: React.ReactNode }) {
  // console.debug("WidgetAttrProvider", props);
  return <Ctx.Provider value={{ instanceId: props.instanceId }}>{props.children}</Ctx.Provider>;
}

/** Widgets call this with just the attribute name declared in their spec */
export function useAttr<T = any>(attrName: string, initial?: T) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttr must be used within <WidgetAttrProvider>");
  const [val, setVal] = useState<T | undefined>(initial);
  useEffect(() => instanceStore.on<T>(ctx.instanceId, attrName, setVal), [ctx.instanceId, attrName]);
  // console.debug("useAttr", attrName, initial);
  return val;
}
