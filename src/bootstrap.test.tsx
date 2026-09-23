import React from "react";
import { render } from "@testing-library/react";
import { RuntimeCompatibilityProvider } from "./runtime/compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "./runtime/sensor-suite-application";
import { useAttachAllBindings } from "./middleware/attach-bindings";
import { Dashboard } from "./bootstrap";

jest.mock("./config", () => ({ config: {} }));
jest.mock("./middleware/attach-bindings", () => ({
  useAttachAllBindings: jest.fn(),
}));

function access(mode: SensorSuiteCompatibilityAccess["mode"]): SensorSuiteCompatibilityAccess {
  return {
    mode,
    runtimeEnabled: mode !== "legacy",
    runtimeState: () => (mode === "legacy" ? "disabled" : "running"),
    resolvePort: () => undefined,
    resolveCapability: () => undefined,
    resourceForPort: () => undefined,
    resourceForCapability: () => undefined,
  };
}

describe("M04-S6 Dashboard binding ownership", () => {
  beforeEach(() => jest.clearAllMocks());

  test("compat-full does not mount the legacy binding bridge", () => {
    render(
      <RuntimeCompatibilityProvider access={access("compat-full")}>
        <Dashboard />
      </RuntimeCompatibilityProvider>,
    );
    expect(useAttachAllBindings).not.toHaveBeenCalled();
  });

  test("legacy rollback still mounts the legacy binding bridge", () => {
    render(
      <RuntimeCompatibilityProvider access={access("legacy")}>
        <Dashboard />
      </RuntimeCompatibilityProvider>,
    );
    expect(useAttachAllBindings).toHaveBeenCalledTimes(1);
  });
});
