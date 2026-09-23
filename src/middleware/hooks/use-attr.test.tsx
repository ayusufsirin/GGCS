import React from "react";
import { act, render, screen } from "@testing-library/react";
import { RuntimeError, type Observation, type Source, type Subscription } from "@ggcs/core";
import { instanceStore } from "../instance-store";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { StatusWidget } from "../../widgets/StatusWidget";
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

  current(): Observation<T> {
    return this.observation;
  }

  subscribe(listener: (observation: Observation<T>) => void): Subscription {
    this.subscriptions += 1;
    this.listeners.add(listener);
    listener(this.observation);
    let closed = false;
    return {
      get closed() {
        return closed;
      },
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

  get activeListeners(): number {
    return this.listeners.size;
  }
}

function compatibilityAccess<T>(
  source: FakeSource<T> | undefined,
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
      if (!binding || binding.kind !== "source") return undefined;
      return source as any;
    },
    resourceForCapability: () => undefined,
  };
}

function RuntimeProbe({
  testId,
  portName,
  initial,
}: {
  testId: string;
  portName: string;
  initial?: number;
}) {
  const value = useAttr<number>(portName, initial);
  return <span data-testid={testId}>{value === undefined ? "undefined" : String(value)}</span>;
}

function StringProbe({ testId, portName }: { testId: string; portName: string }) {
  const value = useAttr<string>(portName);
  return <span data-testid={testId}>{value === undefined ? "undefined" : value}</span>;
}

function renderRuntimeProbe(
  source: FakeSource<number>,
  options: {
    initial?: number;
    instanceId?: string;
    portName?: string;
    mode?: SensorSuiteCompatibilityAccess["mode"];
  } = {},
) {
  const instanceId = options.instanceId ?? SYSTEM_STATUS.instanceId;
  const portName = options.portName ?? SYSTEM_STATUS.portName;
  const access = compatibilityAccess(source, options.mode ?? "compat-read");
  return render(
    <RuntimeCompatibilityProvider access={access}>
      <WidgetAttrProvider instanceId={instanceId}>
        <RuntimeProbe testId="value" portName={portName} initial={options.initial} />
      </WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
}

const error = new RuntimeError({
  code: "TEST_SOURCE_ERROR",
  category: "resource_error",
  message: "test source failed",
});

describe("M04-S3 useAttr compatibility projection", () => {
  test("projects unavailable/fresh/stale/error observations into the legacy value shape", () => {
    const source = new FakeSource<number>({ state: "unavailable", since: 1 });
    renderRuntimeProbe(source, { initial: 5 });
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

    act(() => source.publish({ state: "unavailable", since: 6 }));
    expect(screen.getByTestId("value")).toHaveTextContent("5");
  });

  test("compat-read fails closed when a mapped Runtime Source is unavailable", () => {
    const access = compatibilityAccess<number>(undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <RuntimeCompatibilityProvider access={access}>
          <WidgetAttrProvider instanceId={SYSTEM_STATUS.instanceId}>
            <RuntimeProbe testId="missing" portName={SYSTEM_STATUS.portName} />
          </WidgetAttrProvider>
        </RuntimeCompatibilityProvider>,
      )).toThrow(/compat-read source unavailable/);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("unsubscribes on unmount without disposing the shared Runtime Source", () => {
    const source = new FakeSource<number>({ state: "fresh", value: 1, updatedAt: 1 });
    const view = renderRuntimeProbe(source);
    expect(source.subscriptions).toBe(1);
    expect(source.activeListeners).toBe(1);

    view.unmount();
    expect(source.unsubscriptions).toBe(1);
    expect(source.activeListeners).toBe(0);

    expect(() => source.publish({ state: "fresh", value: 2, updatedAt: 2 })).not.toThrow();
    expect(source.current()).toMatchObject({ state: "fresh", value: 2 });
  });

  test("two consumers use the same Runtime Source and one unmount does not disrupt the other", () => {
    const source = new FakeSource<number>({ state: "fresh", value: 10, updatedAt: 1 });
    const access = compatibilityAccess(source);

    function Twin({ showFirst }: { showFirst: boolean }) {
      return (
        <RuntimeCompatibilityProvider access={access}>
          {showFirst ? (
            <WidgetAttrProvider instanceId={SYSTEM_STATUS.instanceId}>
              <RuntimeProbe testId="first" portName={SYSTEM_STATUS.portName} />
            </WidgetAttrProvider>
          ) : null}
          <WidgetAttrProvider instanceId={SYSTEM_STATUS.instanceId}>
            <RuntimeProbe testId="second" portName={SYSTEM_STATUS.portName} />
          </WidgetAttrProvider>
        </RuntimeCompatibilityProvider>
      );
    }

    const view = render(<Twin showFirst={true} />);
    expect(source.activeListeners).toBe(2);

    act(() => source.publish({ state: "fresh", value: 11, updatedAt: 2 }));
    expect(screen.getByTestId("first")).toHaveTextContent("11");
    expect(screen.getByTestId("second")).toHaveTextContent("11");

    view.rerender(<Twin showFirst={false} />);
    expect(source.activeListeners).toBe(1);

    act(() => source.publish({ state: "fresh", value: 12, updatedAt: 3 }));
    expect(screen.getByTestId("second")).toHaveTextContent("12");
  });

  test("compat-read routes representative Status/Gauge/HUD/Map ports through Runtime", () => {
    const ports = [
      { instanceId: "tabs.items.home.grids.items.rtkRollPitchStatus", portName: "status" },
      { instanceId: "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed", portName: "value" },
      { instanceId: "tabs.items.home.grids.items.hud", portName: "roll" },
      { instanceId: "tabs.items.home.grids.items.map", portName: "latitude" },
    ];

    ports.forEach(({ instanceId, portName }, index) => {
      const source = new FakeSource<number>({ state: "fresh", value: index + 1, updatedAt: 1 });
      const view = renderRuntimeProbe(source, { instanceId, portName });
      expect(source.subscriptions).toBe(1);
      expect(screen.getByTestId("value")).toHaveTextContent(String(index + 1));
      view.unmount();
    });
  });

  test("unmapped camera reads remain legacy in compat-read", () => {
    const source = new FakeSource<number>({ state: "fresh", value: 99, updatedAt: 1 });
    const cameraInstance = "tabs.items.images.grids.items.zedRgb";
    renderRuntimeProbe(source, { initial: 1, instanceId: cameraInstance, portName: "image" });

    expect(source.subscriptions).toBe(0);
    expect(screen.getByTestId("value")).toHaveTextContent("1");

    act(() => instanceStore.emit(cameraInstance, "image", 7));
    expect(screen.getByTestId("value")).toHaveTextContent("7");
  });

  test("compat-full routes the camera through the Runtime compatibility Source", () => {
    const source = new FakeSource<string>({ state: "fresh", value: "base64-camera", updatedAt: 1 });
    const access = compatibilityAccess(source, "compat-full");
    const cameraInstance = "tabs.items.images.grids.items.zedRgb";

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={cameraInstance}>
          <StringProbe testId="camera" portName="image" />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    expect(source.subscriptions).toBe(1);
    expect(screen.getByTestId("camera")).toHaveTextContent("base64-camera");
  });

  test("compat-full fails closed instead of consulting instanceStore for an unmapped attr", () => {
    const source = new FakeSource<number>({ state: "fresh", value: 1, updatedAt: 1 });
    const access = compatibilityAccess(source, "compat-full");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <RuntimeCompatibilityProvider access={access}>
          <WidgetAttrProvider instanceId="unmapped.widget">
            <RuntimeProbe testId="unmapped" portName="value" />
          </WidgetAttrProvider>
        </RuntimeCompatibilityProvider>,
      )).toThrow(/compat-full has no Runtime Source mapping/);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("legacy mode remains an explicit rollback path for migrated telemetry", () => {
    const source = new FakeSource<boolean>({ state: "fresh", value: true, updatedAt: 1 });
    const access = compatibilityAccess(source, "legacy");
    const instanceId = SYSTEM_STATUS.instanceId;

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={instanceId}>
          <StatusWidget
            label="System"
            kind="boolean"
            valueAttr="status"
            onText="OK"
            offText="ERR"
          />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    expect(source.subscriptions).toBe(0);
    expect(screen.getByText("—")).toBeInTheDocument();

    act(() => instanceStore.emit(instanceId, "status", false));
    expect(screen.getByText("ERR")).toBeInTheDocument();
  });

  test("the Status widget renders directly from the Runtime Source in compat-read", () => {
    const source = new FakeSource<boolean>({ state: "fresh", value: true, updatedAt: 1 });
    const access = compatibilityAccess(source);

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={SYSTEM_STATUS.instanceId}>
          <StatusWidget
            label="System"
            kind="boolean"
            valueAttr="status"
            onText="OK"
            offText="ERR"
          />
        </WidgetAttrProvider>
      </RuntimeCompatibilityProvider>,
    );

    expect(source.subscriptions).toBe(1);
    expect(screen.getByText("OK")).toBeInTheDocument();

    act(() => source.publish({ state: "fresh", value: false, updatedAt: 2 }));
    expect(screen.getByText("ERR")).toBeInTheDocument();
  });
});
