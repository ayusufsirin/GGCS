import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Procedure } from "@ggcs/core";
import { SENSOR_SUITE_RESOURCE_IDS } from "@ggcs/sensor-suite";
import { config } from "../../config";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { ServiceWidget } from "../../widgets/ServiceWidget";
import { useServiceCall } from "./use-service";

const INSTANCE = "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord";

function access(procedure?: Procedure<any, any>): SensorSuiteCompatibilityAccess {
  return {
    runtimeState: () => "running",
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: (instanceId, portName) => {
      const binding = resolveCompatibilityBinding(instanceId, portName);
      return binding?.kind === "procedure" ? procedure as any : undefined;
    },
    resourceForCapability: () => undefined,
  };
}

function Probe() {
  const { call, pending, data, error } = useServiceCall<{ value: number }, { success: boolean }>("callService");
  return (
    <div>
      <button onClick={() => void call({ value: 7 })}>call</button>
      <span data-testid="pending">{String(pending)}</span>
      <span data-testid="data">{data ? String(data.success) : "none"}</span>
      <span data-testid="error">{error ? error.message : "none"}</span>
    </div>
  );
}

describe("M05 Runtime-only Procedure hook", () => {
  test("one click invokes exactly one Runtime Procedure", async () => {
    const result = jest.fn(async () => ({ success: true }));
    const invoke = jest.fn(() => ({ result } as any));
    const procedure = { kind: "procedure", id: "bag.stop", invoke } as any;
    render(
      <RuntimeCompatibilityProvider access={access(procedure)}>
        <WidgetAttrProvider instanceId={INSTANCE}><Probe /></WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "call" }));
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("true"));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({ value: 7 });
    expect(result).toHaveBeenCalledTimes(1);
  });


  test("preserves the existing Start SVO request object while routing through the Runtime Procedure", async () => {
    const result = jest.fn(async () => ({ success: true }));
    const invoke = jest.fn(() => ({ result } as any));
    const procedure = {
      kind: "procedure",
      id: SENSOR_SUITE_RESOURCE_IDS.zedRecordingStart,
      invoke,
    } as any;
    const instanceId = "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo";
    const startSvo = (config as any).tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo;
    const requestParams = startSvo.widget.props.requestParams;

    expect(requestParams.target_framerate).toBe(10);
    expect(requestParams.svo_filename).toMatch(/\/zed_.*\.svo2$/);

    render(
      <RuntimeCompatibilityProvider access={access(procedure)}>
        <WidgetAttrProvider instanceId={instanceId}>
          <ServiceWidget {...startSvo.widget.props} />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start SVO" }));
    await waitFor(() => expect(result).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(requestParams);
    await waitFor(() => expect(screen.getByRole("button", { name: "Start SVO" })).toBeEnabled());
  });

  test("fails closed when the mapped Procedure is unavailable", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <RuntimeCompatibilityProvider access={access(undefined)}>
          <WidgetAttrProvider instanceId={INSTANCE}><Probe /></WidgetAttrProvider>
        </RuntimeCompatibilityProvider>,
      )).toThrow(/Runtime Procedure unavailable/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
