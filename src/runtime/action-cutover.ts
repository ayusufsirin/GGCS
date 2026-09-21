import { backendUsesRuntimeForActions, type SensorSuiteBackendMode } from "./backend-mode";
import { isM04Slice4RuntimeProcedurePort } from "./compatibility-map";

export interface LegacyServiceBindingRef {
  readonly instanceId: string;
  readonly attrName: string;
}

/**
 * Remove only explicitly mapped recording Procedures from the legacy service
 * binder once M04-S4 action authority is enabled. Parameter/other service
 * bindings remain legacy until their own slices.
 */
export function filterLegacyServiceBindingsForMode<T extends LegacyServiceBindingRef>(
  mode: SensorSuiteBackendMode,
  bindings: readonly T[],
): T[] {
  if (!backendUsesRuntimeForActions(mode)) return [...bindings];
  return bindings.filter(
    (binding) => !isM04Slice4RuntimeProcedurePort(binding.instanceId, binding.attrName),
  );
}
