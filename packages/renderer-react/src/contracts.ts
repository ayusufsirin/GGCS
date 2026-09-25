import type {
  Command,
  Procedure,
  RuntimeResource,
  Source,
} from "@ggcs/core";
import type { WidgetInstanceId } from "@ggcs/schema";

/**
 * Renderer-facing capability surface for exactly one compiled widget instance.
 * Implementations expose only ports/capabilities that presentation compilation
 * has already authorized and resolved.
 */
export interface ResolvedWidgetAccess {
  input<T, Q = unknown>(port: string): Source<T, Q> | undefined;
  command<T>(port: string): Command<T> | undefined;
  procedure<I, O>(port: string): Procedure<I, O> | undefined;
  capability<T extends RuntimeResource = RuntimeResource>(port: string): T | undefined;
}

/** Narrow presentation access. Deliberately not Runtime. */
export interface PresentationAccess {
  widget(instanceId: WidgetInstanceId): ResolvedWidgetAccess | undefined;
}
