import type {
  ConnectionId,
  ParameterDescriptor,
  ParameterQuery,
  ResourceId,
} from "@ggcs/schema";
import type { RuntimeError } from "./error.js";
import type { Invocation } from "./invocation.js";
import type { Source } from "./source.js";
import type { Subscription } from "./subscription.js";

export type ResourceKind =
  | "source"
  | "command"
  | "procedure"
  | "parameter"
  | "parameter_provider"
  | "connection"
  | "custom";

export interface RuntimeResource {
  readonly id: ResourceId;
  readonly kind: ResourceKind;
}

export interface CommandDispatchReceipt {
  readonly dispatchedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Command<T> extends RuntimeResource {
  readonly kind: "command";
  send(value: T): Promise<CommandDispatchReceipt>;
}

export interface Procedure<I, O> extends RuntimeResource {
  readonly kind: "procedure";
  invoke(input: I): Invocation<O>;
}

export interface Parameter<T> extends RuntimeResource {
  readonly kind: "parameter";
  readonly descriptor: ParameterDescriptor<T>;
  readonly value: Source<T>;
  refresh(): Invocation<T>;
  write(value: T): Invocation<void>;
}

export interface ParameterProvider extends RuntimeResource {
  readonly kind: "parameter_provider";
  list(query?: ParameterQuery): Promise<readonly ParameterDescriptor<unknown>[]>;
  resolve<T = unknown>(id: ResourceId): Promise<Parameter<T>>;
}

export type ConnectionState =
  | { readonly state: "disconnected"; readonly since: number; readonly reason?: RuntimeError }
  | { readonly state: "connecting"; readonly since: number }
  | { readonly state: "connected"; readonly since: number }
  | { readonly state: "reconnecting"; readonly since: number; readonly attempt: number }
  | { readonly state: "degraded"; readonly since: number; readonly reason: RuntimeError };

export interface Connection extends RuntimeResource {
  readonly id: ConnectionId;
  readonly kind: "connection";
  current(): ConnectionState;
  subscribe(listener: (state: ConnectionState) => void): Subscription;
}
