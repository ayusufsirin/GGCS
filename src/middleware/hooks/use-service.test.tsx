import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RuntimeError, type Invocation, type InvocationState, type Procedure, type Subscription } from "@ggcs/core";
import { SENSOR_SUITE_RESOURCE_IDS } from "@ggcs/sensor-suite";
import { config } from "../../config";
import { serviceBus } from "../service-bus";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { ServiceWidget } from "../../widgets/ServiceWidget";
import { WidgetAttrProvider } from "./common";
import { useServiceCall } from "./use-service";

class DeferredInvocation<T> implements Invocation<T> {
  readonly id: string;
  private state: InvocationState<T> = { state: "pending", startedAt: 1 };
  private listeners = new Set<(state: InvocationState<T>) => void>();
  private resolveResult!: (value: T) => void;
  private rejectResult!: (reason: unknown) => void;
  private readonly promise = new Promise<T>((resolve, reject) => {
    this.resolveResult = resolve;
    this.rejectResult = reject;
  });

  constructor(id: string) {
    this.id = id;
    void this.promise.catch(() => undefined);
  }

  current(): InvocationState<T> {
    return this.state;
  }

  subscribe(listener: (state: InvocationState<T>) => void): Subscription {
    this.listeners.add(listener);
    listener(this.state);
    let closed = false;
    return {
      get closed() { return closed; },
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        this.listeners.delete(listener);
      },
    };
  }

  result(): Promise<T> {
    return this.promise;
  }

  succeed(value: T): void {
    this.state = { state: "succeeded", value, completedAt: 2 };
    this.listeners.forEach((listener) => listener(this.state));
    this.resolveResult(value);
  }

  fail(error: RuntimeError): void {
    this.state = { state: "failed", error, completedAt: 2 };
    this.listeners.forEach((listener) => listener(this.state));
    this.rejectResult(error);
  }
}

class FakeProcedure<I, O> implements Procedure<I, O> {
  readonly kind = "procedure" as const;
  readonly invocations: Array<{ input: I; invocation: DeferredInvocation<O> }> = [];

  constructor(readonly id: string) {}

  invoke(input: I): Invocation<O> {
    const invocation = new DeferredInvocation<O>(`${this.id}-${this.invocations.length + 1}`);
    this.invocations.push({ input, invocation });
    return invocation;
  }
}

function compatibilityAccess(
  procedures: ReadonlyMap<string, Procedure<any, any>>,
  mode: SensorSuiteCompatibilityAccess["mode"] = "compat-read",
): SensorSuiteCompatibilityAccess {
  return {
    mode,
    runtimeEnabled: mode !== "legacy",
    runtimeState: () => (mode === "legacy" ? "disabled" : "running"),
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: (instanceId, portName) => {
      const binding = resolveCompatibilityBinding(instanceId, portName);
      if (!binding || binding.kind !== "procedure") return undefined;
      return procedures.get(binding.resourceId) as any;
    },
    resourceForCapability: () => undefined,
  };
}

const BAG_START_INSTANCE =
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord";
const BAG_STOP_INSTANCE =
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord";
const ZED_STOP_INSTANCE =
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo";
const ZED_START_INSTANCE =
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo";

function HookProbe({ label }: { label: string }) {
  const service = useServiceCall<any, any>("callService");
  return (
    <div>
      <button onClick={() => { void service.call({ label }).catch(() => undefined); }}>{label}</button>
      <span data-testid={`${label}-pending`}>{String(service.pending)}</span>
      <span data-testid={`${label}-data`}>{service.data?.message ?? ""}</span>
      <span data-testid={`${label}-error`}>{service.error?.message ?? ""}</span>
    </div>
  );
}

describe("M04-S4 useServiceCall Procedure compatibility", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("compat-read sends one click through exactly one Runtime Procedure and not the legacy service bus", async () => {
    const procedure = new FakeProcedure<{}, { success: boolean }>(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop);
    const serviceBusCall = jest.spyOn(serviceBus, "call");
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]));

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={BAG_STOP_INSTANCE}>
          <ServiceWidget buttonLabel="Stop ROS Bag" buttonPendingLabel="Stopping" requestParams={{}} />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop ROS Bag" }));
    expect(procedure.invocations).toHaveLength(1);
    expect(serviceBusCall).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stopping" })).toBeDisabled();

    await act(async () => {
      procedure.invocations[0]!.invocation.succeed({ success: true });
      await procedure.invocations[0]!.invocation.result();
    });
    expect(screen.getByRole("button", { name: "Stop ROS Bag" })).toBeEnabled();
  });

  test("action 02 sends Start ROS Bag through exactly one Runtime Procedure", async () => {
    const procedure = new FakeProcedure<{}, { success: boolean }>(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStart);
    const serviceBusCall = jest.spyOn(serviceBus, "call");
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]));
    const startBag = (config as any).tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord;
    const requestParams = startBag.widget.props.requestParams;

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={BAG_START_INSTANCE}>
          <ServiceWidget {...startBag.widget.props} />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start ROS Bag" }));
    expect(procedure.invocations).toHaveLength(1);
    expect(procedure.invocations[0]!.input).toBe(requestParams);
    expect(serviceBusCall).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Starting" })).toBeDisabled();

    await act(async () => {
      procedure.invocations[0]!.invocation.succeed({ success: true });
      await procedure.invocations[0]!.invocation.result();
    });
    expect(screen.getByRole("button", { name: "Start ROS Bag" })).toBeEnabled();
  });


  test("action 03 sends Stop SVO through exactly one Runtime Procedure", async () => {
    const procedure = new FakeProcedure<{}, { success: boolean }>(SENSOR_SUITE_RESOURCE_IDS.zedRecordingStop);
    const serviceBusCall = jest.spyOn(serviceBus, "call");
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]));
    const stopSvo = (config as any).tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo;
    const requestParams = stopSvo.widget.props.requestParams;

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={ZED_STOP_INSTANCE}>
          <ServiceWidget {...stopSvo.widget.props} />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop SVO" }));
    expect(procedure.invocations).toHaveLength(1);
    expect(procedure.invocations[0]!.input).toBe(requestParams);
    expect(serviceBusCall).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stopping" })).toBeDisabled();

    await act(async () => {
      procedure.invocations[0]!.invocation.succeed({ success: true });
      await procedure.invocations[0]!.invocation.result();
    });
    expect(screen.getByRole("button", { name: "Stop SVO" })).toBeEnabled();
  });

  test("compat-full keeps mapped recording actions Runtime-only", async () => {
    const procedure = new FakeProcedure<{}, { success: boolean }>(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop);
    const serviceBusCall = jest.spyOn(serviceBus, "call");
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]), "compat-full");

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={BAG_STOP_INSTANCE}><HookProbe label="full" /></WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "full" }));
    expect(procedure.invocations).toHaveLength(1);
    expect(serviceBusCall).not.toHaveBeenCalled();
  });

  test("compat-full fails closed for an unmapped service port instead of using serviceBus", () => {
    const access = compatibilityAccess(new Map(), "compat-full");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <RuntimeCompatibilityProvider access={access}>
          <WidgetAttrProvider instanceId="unmapped.widget"><HookProbe label="unmapped" /></WidgetAttrProvider>
        </RuntimeCompatibilityProvider>,
      )).toThrow(/compat-full has no Runtime Procedure mapping/);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("success/error state is hook-local and simultaneous consumers keep independent Invocation state", async () => {
    const procedure = new FakeProcedure<any, any>(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop);
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]));

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={BAG_STOP_INSTANCE}><HookProbe label="first" /></WidgetAttrProvider>
        <WidgetAttrProvider instanceId={BAG_STOP_INSTANCE}><HookProbe label="second" /></WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "first" }));
    fireEvent.click(screen.getByRole("button", { name: "second" }));
    expect(procedure.invocations).toHaveLength(2);
    expect(screen.getByTestId("first-pending")).toHaveTextContent("true");
    expect(screen.getByTestId("second-pending")).toHaveTextContent("true");

    await act(async () => {
      procedure.invocations[0]!.invocation.succeed({ message: "stopped-first" });
      await procedure.invocations[0]!.invocation.result();
    });
    expect(screen.getByTestId("first-pending")).toHaveTextContent("false");
    expect(screen.getByTestId("first-data")).toHaveTextContent("stopped-first");
    expect(screen.getByTestId("second-pending")).toHaveTextContent("true");

    const timeout = new RuntimeError({
      code: "GGCS_ROSBRIDGE_SERVICE_TIMEOUT",
      category: "invocation_timeout",
      message: "second stop timed out",
    });
    await act(async () => {
      procedure.invocations[1]!.invocation.fail(timeout);
      try { await procedure.invocations[1]!.invocation.result(); } catch { /* expected */ }
    });
    expect(screen.getByTestId("second-pending")).toHaveTextContent("false");
    expect(screen.getByTestId("second-error")).toHaveTextContent("second stop timed out");
  });

  test("legacy mode remains restart-based rollback and does not invoke the Runtime Procedure", async () => {
    const procedure = new FakeProcedure<any, any>(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop);
    const serviceBusCall = jest.spyOn(serviceBus, "call").mockResolvedValue({ success: true });
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]), "legacy");

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={BAG_STOP_INSTANCE}><HookProbe label="legacy" /></WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "legacy" }));
    await act(async () => { await Promise.resolve(); });

    expect(serviceBusCall).toHaveBeenCalledTimes(1);
    expect(procedure.invocations).toHaveLength(0);
  });

  test("action 04 sends Start SVO through one Runtime Procedure with the exact existing request object", async () => {
    const procedure = new FakeProcedure<any, { success: boolean }>(SENSOR_SUITE_RESOURCE_IDS.zedRecordingStart);
    const access = compatibilityAccess(new Map([[procedure.id, procedure]]));
    const serviceBusCall = jest.spyOn(serviceBus, "call");
    const startSvo = (config as any).tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo;
    const requestParams = startSvo.widget.props.requestParams;

    expect(requestParams.target_framerate).toBe(10);
    expect(requestParams.svo_filename).toMatch(/\/zed_.*\.svo2$/);

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={ZED_START_INSTANCE}>
          <ServiceWidget {...startSvo.widget.props} />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start SVO" }));
    expect(procedure.invocations).toHaveLength(1);
    expect(procedure.invocations[0]!.input).toBe(requestParams);
    expect(serviceBusCall).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Starting" })).toBeDisabled();

    await act(async () => {
      procedure.invocations[0]!.invocation.succeed({ success: true });
      await procedure.invocations[0]!.invocation.result();
    });
    expect(screen.getByRole("button", { name: "Start SVO" })).toBeEnabled();
  });
});
