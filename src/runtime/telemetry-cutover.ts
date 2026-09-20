import { backendUsesRuntimeForTelemetry, type SensorSuiteBackendMode } from "./backend-mode";
import { isM04Slice3RuntimeReadPort } from "./compatibility-map";

export interface LegacyTelemetryBindingRef {
  readonly instanceId: string;
  readonly attrName: string;
}

/**
 * Select the legacy subscriber bindings that still need ROSLIB ownership for a
 * backend mode. In M04-S3 compat-read, every explicitly mapped semantic Source
 * is removed from the legacy subscriber path. Unmapped subscriber ports (the
 * current camera compatibility exception) remain legacy-owned.
 */
export function filterLegacySubscriberBindingsForMode<T extends LegacyTelemetryBindingRef>(
  mode: SensorSuiteBackendMode,
  bindings: readonly T[],
): T[] {
  if (!backendUsesRuntimeForTelemetry(mode)) return [...bindings];
  return bindings.filter(
    (binding) => !isM04Slice3RuntimeReadPort(binding.instanceId, binding.attrName),
  );
}
