import {
  assertM04Slice2ModeSupported,
  backendStartsRuntime,
  parseSensorSuiteBackendMode,
} from "./backend-mode";

describe("M04 backend mode", () => {
  test("defaults to legacy so migration remains rollback-safe", () => {
    expect(parseSensorSuiteBackendMode(undefined)).toBe("legacy");
    expect(parseSensorSuiteBackendMode("   ")).toBe("legacy");
    expect(backendStartsRuntime("legacy")).toBe(false);
  });

  test("shadow starts the Runtime without claiming UI authority", () => {
    expect(parseSensorSuiteBackendMode("shadow")).toBe("shadow");
    expect(backendStartsRuntime("shadow")).toBe(true);
    expect(() => assertM04Slice2ModeSupported("shadow")).not.toThrow();
  });

  test("compat-read is enabled for the first read-only cutover", () => {
    expect(parseSensorSuiteBackendMode("compat-read")).toBe("compat-read");
    expect(backendStartsRuntime("compat-read")).toBe(true);
    expect(() => assertM04Slice2ModeSupported("compat-read")).not.toThrow();
  });

  test("compat-full still fails closed until side-effect paths move", () => {
    expect(() => assertM04Slice2ModeSupported("compat-full")).toThrow(/not enabled in M04-S2/);
  });

  test("invalid configuration never silently falls back", () => {
    expect(() => parseSensorSuiteBackendMode("typo")).toThrow(/Invalid REACT_APP_GGCS_BACKEND_MODE/);
  });
});
