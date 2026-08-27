export type RuntimeErrorCategory =
  | "configuration"
  | "schema"
  | "unknown_registration"
  | "plugin_version"
  | "plugin_dependency"
  | "dependency_cycle"
  | "provider_prepare"
  | "provider_create"
  | "resource_unavailable"
  | "resource_error"
  | "command_dispatch"
  | "invocation_failure"
  | "invocation_timeout"
  | "parameter_validation"
  | "parameter_write"
  | "computation_failure"
  | "runtime_lifecycle";

export interface RuntimeErrorOptions {
  readonly code: string;
  readonly category: RuntimeErrorCategory;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class RuntimeError extends Error {
  readonly code: string;
  readonly category: RuntimeErrorCategory;
  readonly details?: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;

  constructor(options: RuntimeErrorOptions) {
    super(options.message);
    this.name = "RuntimeError";
    this.code = options.code;
    this.category = options.category;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function asRuntimeError(
  error: unknown,
  fallback: Omit<RuntimeErrorOptions, "cause">,
): RuntimeError {
  if (error instanceof RuntimeError) return error;
  return new RuntimeError({ ...fallback, cause: error });
}
