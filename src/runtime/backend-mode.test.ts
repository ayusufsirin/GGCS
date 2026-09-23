import {
  assertM04Slice6ModeSupported,
  backendUsesLegacyBindings,
  backendUsesRuntimeForParameters,
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
    expect(() => assertM04Slice6ModeSupported("shadow")).not.toThrow();
  });

  test("compat-read is enabled for telemetry, recording Procedures, and ParameterProvider access", () => {
    expect(parseSensorSuiteBackendMode("compat-read")).toBe("compat-read");
    expect(backendStartsRuntime("compat-read")).toBe(true);
    expect(backendUsesRuntimeForParameters("compat-read")).toBe(true);
    expect(() => assertM04Slice6ModeSupported("compat-read")).not.toThrow();
  });

  test("compat-full is enabled and disables the legacy binding shell", () => {
    expect(() => assertM04Slice6ModeSupported("compat-full")).not.toThrow();
    expect(backendStartsRuntime("compat-full")).toBe(true);
    expect(backendUsesRuntimeForParameters("compat-full")).toBe(true);
    expect(backendUsesLegacyBindings("compat-full")).toBe(false);
    expect(backendUsesLegacyBindings("legacy")).toBe(true);
  });

  test("invalid configuration never silently falls back", () => {
    expect(() => parseSensorSuiteBackendMode("typo")).toThrow(/Invalid REACT_APP_GGCS_BACKEND_MODE/);
  });
});
