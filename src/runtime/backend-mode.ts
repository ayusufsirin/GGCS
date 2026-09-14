export const SENSOR_SUITE_BACKEND_MODES = [
  "legacy",
  "shadow",
  "compat-read",
  "compat-full",
] as const;

export type SensorSuiteBackendMode = typeof SENSOR_SUITE_BACKEND_MODES[number];

const validModes = new Set<string>(SENSOR_SUITE_BACKEND_MODES);

export function parseSensorSuiteBackendMode(raw: string | undefined): SensorSuiteBackendMode {
  if (raw === undefined || raw.trim() === "") return "legacy";
  const value = raw.trim();
  if (!validModes.has(value)) {
    throw new Error(
      `Invalid REACT_APP_GGCS_BACKEND_MODE=${JSON.stringify(raw)}. Expected one of: ${SENSOR_SUITE_BACKEND_MODES.join(", ")}`,
    );
  }
  return value as SensorSuiteBackendMode;
}

export function backendStartsRuntime(mode: SensorSuiteBackendMode): boolean {
  return mode !== "legacy";
}

export function backendUsesRuntimeForTelemetry(mode: SensorSuiteBackendMode): boolean {
  return mode === "compat-read" || mode === "compat-full";
}

export function backendUsesRuntimeForActions(mode: SensorSuiteBackendMode): boolean {
  return mode === "compat-full";
}

/**
 * M04-S2 enables the first authoritative read-only compatibility path.
 * compat-read is now executable, but compat-full remains gated until the
 * Procedure/Command/Parameter cutovers land. Failing closed prevents a mode
 * flag from silently claiming side-effect authority before those paths move.
 */
export function assertM04Slice2ModeSupported(mode: SensorSuiteBackendMode): void {
  if (mode === "compat-full") {
    throw new Error(
      `GGCS backend mode ${mode} is reserved but not enabled in M04-S2; use legacy, shadow, or compat-read until action cutover is implemented`,
    );
  }
}
