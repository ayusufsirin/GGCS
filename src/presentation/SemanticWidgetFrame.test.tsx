import React from "react";
import { render, screen } from "@testing-library/react";
import type { RuntimeResource, Source } from "@ggcs/core";
import { RuntimeCompatibilityProvider } from "../runtime/compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "../runtime/sensor-suite-application";
import { SemanticWidgetFrame } from "./SemanticWidgetFrame";
import { resolveSensorSuiteSemanticWidget } from "./semantic-widget-cutover";

const speedSource: Source<number> = {
  kind: "source",
  id: "vehicle.speed",
  current: () => ({ state: "fresh", value: 4.25, updatedAt: 1 }),
  subscribe: () => ({ closed: false, unsubscribe() {} }),
};

const compatibility: SensorSuiteCompatibilityAccess = {
  runtimeState: () => "running",
  resolvePort: (_instanceId, portName) => portName === "value"
    ? { kind: "source", resourceId: "vehicle.speed" }
    : undefined,
  resolveCapability: () => undefined,
  resourceForPort: <T extends RuntimeResource>(_instanceId: string, portName: string) =>
    portName === "value" ? speedSource as unknown as T : undefined,
  resourceForCapability: () => undefined,
};

test("renders a migrated production gauge through the semantic React registry/access path", () => {
  const instance = resolveSensorSuiteSemanticWidget(
    "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
    "gauge",
  );
  expect(instance).toBeDefined();

  render(
    <RuntimeCompatibilityProvider access={compatibility}>
      <SemanticWidgetFrame instance={instance!} />
    </RuntimeCompatibilityProvider>,
  );

  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "4.25");
  expect(screen.getByText("4.25 m/s")).toBeInTheDocument();
  expect(document.querySelector('[data-ggcs-resolution="exact"]')).not.toBeNull();
});
