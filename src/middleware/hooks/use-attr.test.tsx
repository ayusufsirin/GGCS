import React from "react";
import { act, render, screen } from "@testing-library/react";
import { RuntimeError, type Observation, type Source, type Subscription } from "@ggcs/core";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { useAttr } from "./use-attr";

const SYSTEM_STATUS = {
  instanceId: "tabs.items.home.grids.items.rtkSystemStatus",
  portName: "status",
} as const;

class FakeSource<T> implements Source<T> {
  readonly kind = "source" as const;
  readonly id = "test.runtime.source";
  private listeners = new Set<(observation: Observation<T>) => void>();
  subscriptions = 0;
  unsubscriptions = 0;

  constructor(private observation: Observation<T>) {}
  current(): Observation<T> { return this.observation; }
  subscribe(listener: (observation: Observation<T>) => void): Subscription {
    this.subscriptions += 1;
    this.listeners.add(listener);
    listener(this.observation);
    let closed = false;
    return {
      get closed() { return closed; },
      unsubscribe: () => {
        if (closed) return;
        closed = true;
        this.unsubscriptions += 1;
        this.listeners.delete(listener);
      },
    };
  }
  publish(observation: Observation<T>): void {
    this.observation = observation;
    this.listeners.forEach((listener) => listener(observation));
  }
  get activeListeners(): number { return this.listeners.size; }
}

function compatibilityAccess(source: Source<any> | undefined): SensorSuiteCompatibilityAccess {
  return {
    runtimeState: () => "running",
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: (instanceId, portName) => {
      const binding = resolveCompatibilityBinding(instanceId, portName);
      return binding?.kind === "source" ? source as any : undefined;
    },
    resourceForCapability: () => undefined,
  };
}

function Probe({ portName, initial }: { portName: string; initial?: number }) {
  const value = useAttr<number>(portName, initial);
  return <span data-testid="value">{value === undefined ? "undefined" : String(value)}</span>;
}

function renderProbe(
  source: Source<any> | undefined,
  instanceId: string = SYSTEM_STATUS.instanceId,
  portName: string = SYSTEM_STATUS.portName,
  initial?: number,
) {
  return render(
    <RuntimeCompatibilityProvider access={compatibilityAccess(source)}>
      <WidgetAttrProvider instanceId={instanceId}>
        <Probe portName={portName} initial={initial} />
      </WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
}

const error = new RuntimeError({
  code: "TEST_SOURCE_ERROR",
  category: "resource_error",
  message: "test source failed",
});

describe("M05 Runtime-only useAttr projection", () => {
  test("projects unavailable/fresh/stale/error observations", () => {
    const source = new FakeSource<number>({ state: "unavailable", since: 1 });
    renderProbe(source, SYSTEM_STATUS.instanceId, SYSTEM_STATUS.portName, 5);
    expect(screen.getByTestId("value")).toHaveTextContent("5");

    act(() => source.publish({ state: "fresh", value: 8, updatedAt: 2 }));
    expect(screen.getByTestId("value")).toHaveTextContent("8");
    const stale = { state: "stale", value: 8, updatedAt: 2, staleSince: 3 } as const;
    act(() => source.publish(stale));
    expect(screen.getByTestId("value")).toHaveTextContent("8");
    act(() => source.publish({ state: "error", error, occurredAt: 4, lastGood: stale }));
    expect(screen.getByTestId("value")).toHaveTextContent("8");
    act(() => source.publish({ state: "error", error, occurredAt: 5 }));
    expect(screen.getByTestId("value")).toHaveTextContent("5");
  });

  test("fails closed when an explicitly mapped Source is unavailable", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => renderProbe(undefined)).toThrow(/Runtime Source unavailable/);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("unbound optional visual attrs use their local defaults without any singleton fallback", () => {
    renderProbe(undefined, "tabs.items.home.grids.items.map", "maxPathLength", 50000);
    expect(screen.getByTestId("value")).toHaveTextContent("50000");
  });

  test("camera is Runtime-backed and shared Source subscriptions clean up independently", () => {
    const source = new FakeSource<string>({ state: "fresh", value: "base64-camera", updatedAt: 1 });
    function Camera() {
      const value = useAttr<string>("image");
      return <span data-testid="camera">{value}</span>;
    }
    const access = compatibilityAccess(source);
    const instanceId = "tabs.items.images.grids.items.zedRgb";
    const view = render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={instanceId}><Camera /></WidgetAttrProvider>
        <WidgetAttrProvider instanceId={instanceId}><Camera /></WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );
    expect(source.activeListeners).toBe(2);
    expect(screen.getAllByTestId("camera")[0]).toHaveTextContent("base64-camera");
    view.unmount();
    expect(source.activeListeners).toBe(0);
    expect(source.unsubscriptions).toBe(2);
  });
});
