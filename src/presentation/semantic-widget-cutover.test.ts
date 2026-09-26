import type { RuntimeResource, Source } from "@ggcs/core";
import {
  createSensorSuiteSemanticPresentationAccess,
  resolveSensorSuiteSemanticWidget,
  SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS,
} from "./semantic-widget-cutover";
import type { SensorSuiteCompatibilityAccess } from "../runtime/sensor-suite-application";

function source(id: string): Source<number> {
  return {
    kind: "source",
    id,
    current: () => ({ state: "fresh", value: 12, updatedAt: 1 }),
    subscribe: () => ({ closed: false, unsubscribe() {} }),
  };
}

describe("M05-S5 Sensor Suite semantic widget cutover", () => {
  test("selects only the explicitly migrated production Gauge/Status instances", () => {
    expect(SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS).toHaveLength(10);
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "gauge",
    )?.spec.type).toBe("ggcs:gauge");
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.gpsStatus",
      "status",
    )?.spec.type).toBe("ggcs:status");
    expect(resolveSensorSuiteSemanticWidget("tabs.items.home.grids.items.map", "map")).toBeUndefined();
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.gpsStatus",
      "gauge",
    )).toBeUndefined();
  });

  test("portable semantic props contain no React component objects or renderer colors", () => {
    for (const instanceId of SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS) {
      const legacyName = instanceId.includes("gauges.grids.items") ? "gauge" : "status";
      const instance = resolveSensorSuiteSemanticWidget(instanceId, legacyName);
      expect(instance).toBeDefined();
      expect(() => JSON.stringify(instance?.props)).not.toThrow();
      expect(JSON.stringify(instance?.props)).not.toMatch(/needleColor|onColor|offColor|#[0-9a-f]{3,8}/i);
    }
  });

  test("adapts semantic value ports through the existing explicit Runtime compatibility mapping", () => {
    const speed = source("vehicle.speed") as RuntimeResource;
    const compatibility: SensorSuiteCompatibilityAccess = {
      runtimeState: () => "running",
      resolvePort: (instanceId, portName) => instanceId.includes("speed") && portName === "value"
        ? { kind: "source", resourceId: "vehicle.speed" }
        : undefined,
      resolveCapability: () => undefined,
      resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
        instanceId.includes("speed") && portName === "value" ? speed as unknown as T : undefined,
      resourceForCapability: () => undefined,
    };

    const access = createSensorSuiteSemanticPresentationAccess(compatibility);
    const widget = access.widget("tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed");
    expect(widget?.input<number>("value")).toBe(speed);
    expect(widget?.input<number>("missing")).toBeUndefined();
    expect(access.widget("tabs.items.home.grids.items.map")).toBeUndefined();
  });
});
