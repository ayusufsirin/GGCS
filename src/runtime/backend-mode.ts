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
  return mode === "compat-read" || mode === "compat-full";
}

export function backendUsesRuntimeForParameters(mode: SensorSuiteBackendMode): boolean {
  return mode === "compat-read" || mode === "compat-full";
}

export function backendUsesLegacyBindings(mode: SensorSuiteBackendMode): boolean {
  return mode !== "compat-full";
}

/** M04-S6 enables compat-full while retaining legacy/shadow/compat-read rollback modes. */
export function assertM04Slice6ModeSupported(mode: SensorSuiteBackendMode): void {
  void mode;
}
