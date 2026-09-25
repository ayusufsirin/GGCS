import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  CommandDispatchReceipt,
  Invocation,
  InvocationState,
  Observation,
  ParameterProvider,
  RuntimeResource,
} from "@ggcs/core";
import type { JsonValue } from "@ggcs/schema";
import type {
  PresentationAccess,
  ResolvedWidgetAccess,
} from "./contracts.js";
import type { ResolvedWidgetInstance } from "@ggcs/widgets";
import type { ReactRendererSession } from "./session.js";

const RendererSessionContext = createContext<ReactRendererSession | null>(null);
const WidgetContext = createContext<{
  readonly instance: ResolvedWidgetInstance;
  readonly access: ResolvedWidgetAccess;
} | null>(null);

export function ReactRendererProvider(props: {
  readonly session: ReactRendererSession;
  readonly children: React.ReactNode;
}) {
  if (props.session.state() !== "active") {
    throw new Error("Cannot render with a stopped ReactRendererSession");
  }
  return (
    <RendererSessionContext.Provider value={props.session}>
      {props.children}
    </RendererSessionContext.Provider>
  );
}

export function ResolvedWidgetProvider(props: {
  readonly instance: ResolvedWidgetInstance;
  readonly access: ResolvedWidgetAccess;
  readonly children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ instance: props.instance, access: props.access }),
    [props.instance, props.access],
  );
  return <WidgetContext.Provider value={value}>{props.children}</WidgetContext.Provider>;
}

export function useReactRendererSession(): ReactRendererSession {
  const session = useContext(RendererSessionContext);
  if (!session) throw new Error("useReactRendererSession must be used within <ReactRendererProvider>");
  return session;
}

function useWidgetContext() {
  const context = useContext(WidgetContext);
  if (!context) throw new Error("Widget access hooks must be used within <ResolvedWidgetProvider>");
  return context;
}

export function useResolvedWidgetInstance(): ResolvedWidgetInstance {
  return useWidgetContext().instance;
}

export function useWidgetProps<T extends Readonly<Record<string, JsonValue>> = Readonly<Record<string, JsonValue>>>(): T {
  return useWidgetContext().instance.props as T;
}

export function useResolvedWidgetAccess(): ResolvedWidgetAccess {
  return useWidgetContext().access;
}

/** Observation-preserving input hook. Optional omitted ports return undefined. */
export function useWidgetInputObservation<T, Q = unknown>(port: string): Observation<T, Q> | undefined {
  const access = useResolvedWidgetAccess();
  const source = access.input<T, Q>(port);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!source) return () => undefined;
      const subscription = source.subscribe(() => notify());
      return () => subscription.unsubscribe();
    },
    [source],
  );
  const getSnapshot = useCallback(() => source?.current(), [source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type WidgetCommand<T> = (value: T) => Promise<CommandDispatchReceipt>;

export function useWidgetCommand<T>(port: string): WidgetCommand<T> | undefined {
  const command = useResolvedWidgetAccess().command<T>(port);
  return useMemo(() => (command ? (value: T) => command.send(value) : undefined), [command]);
}

export type WidgetProcedure<I, O> = (input: I) => Invocation<O>;

export function useWidgetProcedure<I, O>(port: string): WidgetProcedure<I, O> | undefined {
  const procedure = useResolvedWidgetAccess().procedure<I, O>(port);
  return useMemo(() => (procedure ? (input: I) => procedure.invoke(input) : undefined), [procedure]);
}

export function useWidgetCapability<T extends RuntimeResource = ParameterProvider>(port: string): T | undefined {
  return useResolvedWidgetAccess().capability<T>(port);
}

export function useInvocationState<O>(invocation: Invocation<O> | undefined): InvocationState<O> | undefined {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!invocation) return () => undefined;
      const subscription = invocation.subscribe(() => notify());
      return () => subscription.unsubscribe();
    },
    [invocation],
  );
  const getSnapshot = useCallback(() => invocation?.current(), [invocation]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function accessForWidget(
  presentationAccess: PresentationAccess,
  instance: ResolvedWidgetInstance,
): ResolvedWidgetAccess {
  const access = presentationAccess.widget(instance.id);
  if (!access) {
    throw new Error(`Resolved presentation access is missing widget ${instance.id}`);
  }
  return access;
}
