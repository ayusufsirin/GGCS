import type {
  Invocation,
  Procedure,
  RuntimeResource,
  Source,
  Subscription,
} from "@ggcs/core";
import type { ImageFrame } from "@ggcs/widgets";
import { SENSOR_SUITE_RECORDING_REQUESTS } from "../application/recording-actions";
import {
  createSensorSuiteSemanticPresentationAccess,
  resolveSensorSuiteSemanticWidget,
  SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS,
} from "./semantic-widget-cutover";
import type { SensorSuiteCompatibilityAccess } from "../runtime/sensor-suite-application";

function source<T>(id: string, value: T): Source<T> {
  return {
    kind: "source",
    id,
    current: () => ({ state: "fresh", value, updatedAt: 1 }),
    subscribe: () => ({ closed: false, unsubscribe() {} }) as Subscription,
  };
}

function legacyName(instanceId: string): string {
  if (instanceId.includes("gauges.grids.items")) return "gauge";
  if (instanceId.includes("actions.grids.items")) return "service";
  if (instanceId.includes("items.images")) return "image";
  return "status";
}

describe("M05-S6 Sensor Suite semantic widget cutover", () => {
  test("selects the explicit Gauge/Status/ProcedureAction/Image production instances only", () => {
    expect(SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS).toHaveLength(15);
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "gauge",
    )?.spec.type).toBe("ggcs:gauge");
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.gpsStatus",
      "status",
    )?.spec.type).toBe("ggcs:status");
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
      "service",
    )?.spec.type).toBe("ggcs:procedure-action");
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.images.grids.items.zedRgb",
      "image",
    )?.spec.type).toBe("ggcs:image");
    expect(resolveSensorSuiteSemanticWidget("tabs.items.home.grids.items.map", "map")).toBeUndefined();
    expect(resolveSensorSuiteSemanticWidget(
      "tabs.items.home.grids.items.gpsStatus",
      "gauge",
    )).toBeUndefined();
  });

  test("portable semantic props contain no React component objects, request payloads, or renderer colors", () => {
    for (const instanceId of SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS) {
      const instance = resolveSensorSuiteSemanticWidget(instanceId, legacyName(instanceId));
      expect(instance).toBeDefined();
      const props = JSON.stringify(instance?.props);
      expect(() => JSON.parse(props)).not.toThrow();
      expect(props).not.toMatch(/needleColor|onColor|offColor|#[0-9a-f]{3,8}|requestParams|svo_filename|target_framerate/i);
    }
  });

  test("adapts semantic value ports through the existing explicit Runtime compatibility mapping", () => {
    const speed = source("vehicle.speed", 12) as RuntimeResource;
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

  test("binds application-owned recording request data before ProcedureAction rendering", () => {
    let invokedWith: unknown;
    const invocation: Invocation<unknown> = {
      id: "test.invocation",
      current: () => ({ state: "pending", startedAt: 1 }),
      subscribe: () => ({ closed: false, unsubscribe() {} }) as Subscription,
      result: async () => ({}),
    };
    const procedure: Procedure<unknown, unknown> = {
      kind: "procedure",
      id: "zed.recording.start",
      invoke(input) {
        invokedWith = input;
        return invocation;
      },
    };
    const target = "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo";
    const compatibility: SensorSuiteCompatibilityAccess = {
      runtimeState: () => "running",
      resolvePort: (instanceId, portName) => instanceId === target && portName === "callService"
        ? { kind: "procedure", resourceId: "zed.recording.start" }
        : undefined,
      resolveCapability: () => undefined,
      resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
        instanceId === target && portName === "callService" ? procedure as unknown as T : undefined,
      resourceForCapability: () => undefined,
    };

    const trigger = createSensorSuiteSemanticPresentationAccess(compatibility)
      .widget(target)?.procedure<void, unknown>("trigger");
    expect(trigger).toBeDefined();
    trigger?.invoke();
    expect(invokedWith).toEqual(SENSOR_SUITE_RECORDING_REQUESTS.zedStart);
    expect((invokedWith as { svo_filename: string }).svo_filename).toMatch(/zed_\d{4}_\d{2}_\d{2}-\d{2}_\d{2}_\d{2}\.svo2$/);
  });

  test("adapts the existing camera base64 Source into renderer-neutral ImageFrame before the widget", () => {
    const camera = source("camera.zed.rgb.data", "YWJj") as RuntimeResource;
    const target = "tabs.items.images.grids.items.zedRgb";
    const compatibility: SensorSuiteCompatibilityAccess = {
      runtimeState: () => "running",
      resolvePort: (instanceId, portName) => instanceId === target && portName === "image"
        ? { kind: "source", resourceId: "camera.zed.rgb.data" }
        : undefined,
      resolveCapability: () => undefined,
      resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
        instanceId === target && portName === "image" ? camera as unknown as T : undefined,
      resourceForCapability: () => undefined,
    };

    const frameSource = createSensorSuiteSemanticPresentationAccess(compatibility)
      .widget(target)?.input<ImageFrame>("frame");
    expect(frameSource?.current()).toEqual({
      state: "fresh",
      value: {
        payload: "YWJj",
        mimeType: "image/png",
        encoding: "base64",
        provenance: "camera.zed.rgb.data",
      },
      updatedAt: 1,
    });
  });
});
