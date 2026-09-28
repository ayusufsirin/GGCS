import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  Invocation,
  Parameter,
  ParameterProvider,
  Procedure,
  RuntimeResource,
  Source,
  Subscription,
} from "@ggcs/core";
import { SENSOR_SUITE_RECORDING_REQUESTS } from "../application/recording-actions";
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

function compatibilityFor(options: {
  readonly instanceId: string;
  readonly legacyPort: string;
  readonly binding: { readonly kind: "source" | "procedure"; readonly resourceId: string };
  readonly resource: RuntimeResource;
}): SensorSuiteCompatibilityAccess {
  return {
    runtimeState: () => "running",
    resolvePort: (instanceId, portName) => instanceId === options.instanceId && portName === options.legacyPort
      ? options.binding
      : undefined,
    resolveCapability: () => undefined,
    resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
      instanceId === options.instanceId && portName === options.legacyPort
        ? options.resource as T
        : undefined,
    resourceForCapability: () => undefined,
  };
}

test("renders a migrated production gauge through the semantic React registry/access path", () => {
  const instanceId = "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed";
  const instance = resolveSensorSuiteSemanticWidget(instanceId, "gauge");
  expect(instance).toBeDefined();

  render(
    <RuntimeCompatibilityProvider access={compatibilityFor({
      instanceId,
      legacyPort: "value",
      binding: { kind: "source", resourceId: "vehicle.speed" },
      resource: speedSource,
    })}>
      <SemanticWidgetFrame instance={instance!} />
    </RuntimeCompatibilityProvider>,
  );

  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "4.25");
  expect(screen.getByText("4.25 m/s")).toBeInTheDocument();
  expect(document.querySelector('[data-ggcs-resolution="exact"]')).not.toBeNull();
});

test("invokes a migrated recording action through a bound semantic Procedure", () => {
  let invokedWith: unknown;
  const invocation: Invocation<unknown> = {
    id: "test.invocation",
    current: () => ({ state: "pending", startedAt: 1 }),
    subscribe(listener) {
      listener(this.current());
      return { closed: false, unsubscribe() {} } as Subscription;
    },
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
  const instanceId = "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo";
  const instance = resolveSensorSuiteSemanticWidget(instanceId, "service");
  expect(instance).toBeDefined();

  render(
    <RuntimeCompatibilityProvider access={compatibilityFor({
      instanceId,
      legacyPort: "callService",
      binding: { kind: "procedure", resourceId: "zed.recording.start" },
      resource: procedure,
    })}>
      <SemanticWidgetFrame instance={instance!} />
    </RuntimeCompatibilityProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Start SVO" }));
  expect(invokedWith).toEqual(SENSOR_SUITE_RECORDING_REQUESTS.zedStart);
  expect(screen.getByRole("button", { name: "Starting" })).toBeDisabled();
});

test("renders the migrated camera through renderer-neutral ImageFrame adaptation", () => {
  const camera: Source<string> = {
    kind: "source",
    id: "camera.zed.rgb.data",
    current: () => ({ state: "fresh", value: "YWJj", updatedAt: 1 }),
    subscribe: () => ({ closed: false, unsubscribe() {} }),
  };
  const instanceId = "tabs.items.images.grids.items.zedRgb";
  const instance = resolveSensorSuiteSemanticWidget(instanceId, "image");
  expect(instance).toBeDefined();

  render(
    <RuntimeCompatibilityProvider access={compatibilityFor({
      instanceId,
      legacyPort: "image",
      binding: { kind: "source", resourceId: "camera.zed.rgb.data" },
      resource: camera,
    })}>
      <SemanticWidgetFrame instance={instance!} />
    </RuntimeCompatibilityProvider>,
  );

  expect(screen.getByRole("img", { name: "ZED RGB Image" }))
    .toHaveAttribute("src", "data:image/png;base64,YWJj");
  expect(document.querySelector('[data-ggcs-widget="image"]'))
    .toHaveAttribute("data-observation-state", "fresh");
});


test("renders the migrated parameter browser through generic ParameterProvider capability access", async () => {
  localStorage.clear();
  const write = jest.fn(async (_next: unknown) => undefined);
  const descriptor = {
    id: "/node:param",
    type: { id: "ggcs:type/string", schema: { type: "string" }, title: "String" },
    writable: true,
  } as const;
  const valueSource: Source<string> = {
    kind: "source",
    id: "/node:param.value",
    current: () => ({ state: "fresh", value: "10", updatedAt: 1 }),
    subscribe: () => ({ closed: false, unsubscribe() {} }),
  };
  const parameter: Parameter<string> = {
    kind: "parameter",
    id: "/node:param",
    descriptor,
    value: valueSource,
    refresh: () => ({
      id: "refresh",
      current: () => ({ state: "succeeded", completedAt: 2, value: "10" }),
      subscribe: () => ({ closed: false, unsubscribe() {} }),
      result: async () => "10",
    }),
    write: (next) => ({
      id: "write",
      current: () => ({ state: "succeeded", completedAt: 2, value: undefined }),
      subscribe: () => ({ closed: false, unsubscribe() {} }),
      result: async () => { await write(next); },
    }),
  };
  const provider: ParameterProvider = {
    kind: "parameter_provider",
    id: "shadow.parameters",
    list: async () => [descriptor],
    resolve: async <T,>() => parameter as unknown as Parameter<T>,
  };
  const instanceId = "tabs.items.rosParameters";
  const instance = resolveSensorSuiteSemanticWidget(instanceId, "rosParameters");
  expect(instance).toBeDefined();
  const compatibility: SensorSuiteCompatibilityAccess = {
    runtimeState: () => "running",
    resolvePort: () => undefined,
    resolveCapability: (candidateId, capabilityName) => candidateId === instanceId && capabilityName === "parameters"
      ? { kind: "parameterProvider", resourceId: "shadow.parameters" }
      : undefined,
    resourceForPort: () => undefined,
    resourceForCapability: <T extends RuntimeResource>(candidateId: string, capabilityName: string) =>
      candidateId === instanceId && capabilityName === "parameters" ? provider as unknown as T : undefined,
  };

  render(
    <RuntimeCompatibilityProvider access={compatibility}>
      <SemanticWidgetFrame instance={instance!} />
    </RuntimeCompatibilityProvider>,
  );

  await screen.findByRole("option", { name: "/node" });
  fireEvent.click(screen.getByRole("button", { name: "Load Parameters" }));
  await screen.findByText("/node:param");
  expect(localStorage.getItem("paramDefaults")).toBe(JSON.stringify({ "/node:param": "10" }));

  fireEvent.change(screen.getByRole("textbox", { name: "Edit /node:param" }), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await act(async () => undefined);
  expect(write).toHaveBeenCalledWith("20");
  expect(localStorage.getItem("paramDefaults")).toBe(JSON.stringify({ "/node:param": "10" }));
});
