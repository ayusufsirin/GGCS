import type { RuntimeClock, ScheduledTask } from "./clock.js";
import { RuntimeError, asRuntimeError } from "./error.js";
import type { Subscription } from "./subscription.js";
import { createSubscription } from "./subscription.js";

export type InvocationState<O> =
  | { readonly state: "pending"; readonly startedAt: number }
  | { readonly state: "succeeded"; readonly value: O; readonly completedAt: number }
  | { readonly state: "failed"; readonly error: RuntimeError; readonly completedAt: number }
  | { readonly state: "timed_out"; readonly error: RuntimeError; readonly completedAt: number };

export interface Invocation<O> {
  readonly id: string;
  current(): InvocationState<O>;
  subscribe(listener: (state: InvocationState<O>) => void): Subscription;
  result(): Promise<O>;
}

export interface InvocationController<O> {
  readonly invocation: Invocation<O>;
  succeed(value: O): void;
  fail(error: unknown): void;
  timeout(error?: RuntimeError): void;
}

let invocationSequence = 0;

export function createInvocationController<O>(options: {
  readonly clock: RuntimeClock;
  readonly id?: string;
  readonly timeoutMs?: number;
  readonly failureCode?: string;
}): InvocationController<O> {
  const id = options.id ?? `invocation-${++invocationSequence}`;
  const listeners = new Set<(state: InvocationState<O>) => void>();
  let current: InvocationState<O> = {
    state: "pending",
    startedAt: options.clock.wallNow(),
  };
  let terminal = false;
  let timeoutTask: ScheduledTask | undefined;
  let resolveResult!: (value: O | PromiseLike<O>) => void;
  let rejectResult!: (reason?: unknown) => void;
  const resultPromise = new Promise<O>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // Invocation errors are observable through state even when a caller chooses not
  // to await result(); prevent process-level unhandled rejection noise.
  void resultPromise.catch(() => undefined);

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch {
        // Consumer failure is isolated.
      }
    }
  };

  const finish = (next: InvocationState<O>): boolean => {
    if (terminal) return false;
    terminal = true;
    timeoutTask?.cancel();
    timeoutTask = undefined;
    current = next;
    notify();
    return true;
  };

  if (options.timeoutMs !== undefined) {
    timeoutTask = options.clock.schedule(options.timeoutMs, () => {
      const error = new RuntimeError({
        code: "GGCS_INVOCATION_TIMEOUT",
        category: "invocation_timeout",
        message: `Invocation ${id} timed out after ${options.timeoutMs}ms`,
        details: { invocationId: id, timeoutMs: options.timeoutMs },
      });
      if (
        finish({
          state: "timed_out",
          error,
          completedAt: options.clock.wallNow(),
        })
      ) {
        rejectResult(error);
      }
    });
  }

  const invocation: Invocation<O> = {
    id,
    current(): InvocationState<O> {
      return current;
    },
    subscribe(listener: (state: InvocationState<O>) => void): Subscription {
      listeners.add(listener);
      try {
        listener(current);
      } catch {
        // Consumer failure is isolated.
      }
      return createSubscription(() => listeners.delete(listener));
    },
    result(): Promise<O> {
      return resultPromise;
    },
  };

  return {
    invocation,
    succeed(value: O): void {
      if (finish({ state: "succeeded", value, completedAt: options.clock.wallNow() })) {
        resolveResult(value);
      }
    },
    fail(error: unknown): void {
      const runtimeError = asRuntimeError(error, {
        code: options.failureCode ?? "GGCS_INVOCATION_FAILED",
        category: "invocation_failure",
        message: `Invocation ${id} failed`,
        details: { invocationId: id },
      });
      if (
        finish({
          state: "failed",
          error: runtimeError,
          completedAt: options.clock.wallNow(),
        })
      ) {
        rejectResult(runtimeError);
      }
    },
    timeout(error?: RuntimeError): void {
      const runtimeError =
        error ??
        new RuntimeError({
          code: "GGCS_INVOCATION_TIMEOUT",
          category: "invocation_timeout",
          message: `Invocation ${id} timed out`,
          details: { invocationId: id },
        });
      if (
        finish({
          state: "timed_out",
          error: runtimeError,
          completedAt: options.clock.wallNow(),
        })
      ) {
        rejectResult(runtimeError);
      }
    },
  };
}
