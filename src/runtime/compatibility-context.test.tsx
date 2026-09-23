import React from "react";
import { render, screen } from "@testing-library/react";
import {
  RuntimeCompatibilityProvider,
  useRuntimeCompatibility,
} from "./compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "./sensor-suite-application";

const access: SensorSuiteCompatibilityAccess = {
  runtimeState: () => "running",
  resolvePort: () => undefined,
  resolveCapability: () => undefined,
  resourceForPort: () => undefined,
  resourceForCapability: () => undefined,
};

function Probe() {
  const runtime = useRuntimeCompatibility();
  return <span>{runtime.runtimeState()}</span>;
}

describe("RuntimeCompatibilityProvider", () => {
  test("exposes constrained Runtime access rather than an unrestricted Runtime", () => {
    render(
      <RuntimeCompatibilityProvider access={access}>
        <Probe />
      </RuntimeCompatibilityProvider>,
    );
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});
