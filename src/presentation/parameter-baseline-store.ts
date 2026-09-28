import type { ParameterBaselineStore } from "@ggcs/widgets-react";

/**
 * Preserves the existing Sensor Suite UI baseline snapshot separately from
 * ParameterDescriptor.defaultValue. This remains Web/profile persistence,
 * not provider-owned parameter metadata.
 */
const LEGACY_BASELINE_KEY = "paramDefaults";

export const sensorSuiteParameterBaselineStore: ParameterBaselineStore = {
  load() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(LEGACY_BASELINE_KEY);
      return raw ? JSON.parse(raw) as Record<string, string> : {};
    } catch {
      return {};
    }
  },
  save(values) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LEGACY_BASELINE_KEY, JSON.stringify(values));
    } catch {
      // Browser/profile persistence failure must not break parameter access.
    }
  },
  clear() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(LEGACY_BASELINE_KEY);
    } catch {
      // Ignore unavailable browser/profile persistence.
    }
  },
};
