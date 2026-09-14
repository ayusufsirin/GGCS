import {
  assertM04Slice1ModeSupported,
  backendStartsRuntime,
  parseSensorSuiteBackendMode,
} from "./backend-mode";

describe("M04 backend mode", () => {
  test("defaults to legacy so S1 is rollback-safe", () => {
    expect(parseSensorSuiteBackendMode(undefined)).toBe("legacy");
    expect(parseSensorSuiteBackendMode("   ")).toBe("legacy");
    expect(backendStartsRuntime("legacy")).toBe(false);
  });

  test("shadow starts the Runtime without claiming UI authority", () => {
    expect(parseSensorSuiteBackendMode("shadow")).toBe("shadow");
    expect(backendStartsRuntime("shadow")).toBe(true);
    expect(() => assertM04Slice1ModeSupported("shadow")).not.toThrow();
  });

  test("future authoritative modes fail closed until their cutover slices land", () => {
    expect(() => assertM04Slice1ModeSupported("compat-read")).toThrow(/not enabled in M04-S1/);
    expect(() => assertM04Slice1ModeSupported("compat-full")).toThrow(/not enabled in M04-S1/);
  });

  test("invalid configuration never silently falls back", () => {
    expect(() => parseSensorSuiteBackendMode("typo")).toThrow(/Invalid REACT_APP_GGCS_BACKEND_MODE/);
  });
});
