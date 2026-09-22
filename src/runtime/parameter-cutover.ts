import {
  backendUsesRuntimeForParameters,
  type SensorSuiteBackendMode,
} from "./backend-mode";

export interface LegacyParameterServiceBindingRef {
  readonly instanceId: string;
  readonly attrName: string;
}

const ROS_PARAMETERS_INSTANCE = "tabs.items.rosParameters";
const M04_SLICE5_LEGACY_PARAMETER_SERVICE_PORTS = new Set([
  `${ROS_PARAMETERS_INSTANCE}::listNodes`,
  `${ROS_PARAMETERS_INSTANCE}::getParamNames`,
  `${ROS_PARAMETERS_INSTANCE}::getParam`,
  `${ROS_PARAMETERS_INSTANCE}::setParam`,
]);

export function isM04Slice5LegacyParameterServicePort(
  instanceId: string,
  attrName: string,
): boolean {
  return M04_SLICE5_LEGACY_PARAMETER_SERVICE_PORTS.has(`${instanceId}::${attrName}`);
}

/**
 * Once the semantic ParameterProvider is authoritative, the old rosapi-backed
 * service bindings must not be attached in the same process. Legacy/shadow keep
 * the complete service set for rollback and parity observation.
 */
export function filterLegacyParameterServiceBindingsForMode<
  T extends LegacyParameterServiceBindingRef,
>(mode: SensorSuiteBackendMode, bindings: readonly T[]): T[] {
  if (!backendUsesRuntimeForParameters(mode)) return [...bindings];
  return bindings.filter(
    (binding) => !isM04Slice5LegacyParameterServicePort(binding.instanceId, binding.attrName),
  );
}
