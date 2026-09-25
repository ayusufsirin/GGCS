import type { ResolvedPresentation } from "@ggcs/widgets";
import type { PresentationAccess } from "./contracts.js";
import type { ReactWidgetRegistry } from "./registry.js";

export interface ReactRendererAttachContext {
  readonly presentation: ResolvedPresentation;
  readonly access: PresentationAccess;
  readonly registry: ReactWidgetRegistry;
}

export interface ReactRendererSession {
  readonly presentation: ResolvedPresentation;
  readonly access: PresentationAccess;
  readonly registry: ReactWidgetRegistry;
  state(): "active" | "stopped";
  stop(): Promise<void>;
}

/**
 * Creates an independent renderer lifetime. There is intentionally no Runtime
 * reference here, so stopping this session cannot stop or dispose Runtime.
 */
export function createReactRendererSession(
  context: ReactRendererAttachContext,
): ReactRendererSession {
  let state: "active" | "stopped" = "active";
  return {
    presentation: context.presentation,
    access: context.access,
    registry: context.registry,
    state: () => state,
    async stop() {
      state = "stopped";
    },
  };
}
