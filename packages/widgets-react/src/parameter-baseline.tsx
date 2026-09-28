import React, { createContext, useContext } from "react";

export interface ParameterBaselineStore {
  load(): Record<string, string>;
  save(values: Readonly<Record<string, string>>): void;
  clear(): void;
}

const ParameterBaselineContext = createContext<ParameterBaselineStore | undefined>(undefined);

export function ParameterBaselineProvider(props: {
  readonly store?: ParameterBaselineStore;
  readonly children: React.ReactNode;
}) {
  return (
    <ParameterBaselineContext.Provider value={props.store}>
      {props.children}
    </ParameterBaselineContext.Provider>
  );
}

export function useParameterBaselineStore(): ParameterBaselineStore | undefined {
  return useContext(ParameterBaselineContext);
}
