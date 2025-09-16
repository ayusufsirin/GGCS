import React, { createContext } from "react";

export const Ctx = createContext<{ instanceId: string } | null>(null);

export function WidgetAttrProvider(props: { instanceId: string; children: React.ReactNode }) {
  return <Ctx.Provider value={{instanceId: props.instanceId}}>{props.children}</Ctx.Provider>;
}