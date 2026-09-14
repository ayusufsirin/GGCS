import React, { createContext, useContext } from "react";
import type { SensorSuiteCompatibilityAccess } from "./sensor-suite-application";

const RuntimeCompatibilityContext = createContext<SensorSuiteCompatibilityAccess | null>(null);

export function RuntimeCompatibilityProvider(props: {
  readonly access: SensorSuiteCompatibilityAccess;
  readonly children: React.ReactNode;
}) {
  return (
    <RuntimeCompatibilityContext.Provider value={props.access}>
      {props.children}
    </RuntimeCompatibilityContext.Provider>
  );
}

export function useRuntimeCompatibility(): SensorSuiteCompatibilityAccess {
  const access = useContext(RuntimeCompatibilityContext);
  if (!access) {
    throw new Error("useRuntimeCompatibility must be used within <RuntimeCompatibilityProvider>");
  }
  return access;
}
