import React from "react";
import { act, render, screen } from "@testing-library/react";
import { RuntimeError, type Observation, type Source, type Subscription } from "@ggcs/core";
import { instanceStore } from "../instance-store";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  M04_SLICE_2_RUNTIME_READ_TARGET,
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { StatusWidget } from "../../widgets/StatusWidget";
import { WidgetAttrProvider } from "./common";
import { useAttr } from "./use-attr";

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
    for (const listener of [...this.listeners]) listener(observation);
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
  initial,
}: {
  testId: string;
  initial?: number;
}) {
  const value = useAttr<number>(M04_SLICE_2_RUNTIME_READ_TARGET.portName, initial);
  return <span data-testid={testId}>{value === undefined ? "undefined" : String(value)}</span>;
}

function renderRuntimeProbe(
  source: FakeSource<number>,
  options: { initial?: number; instanceId?: string; mode?: SensorSuiteCompatibilityAccess["mode"] } = {},
) {
  const instanceId = options.instanceId ?? M04_SLICE_2_RUNTIME_READ_TARGET.instanceId;
  const access = compatibilityAccess(source, options.mode ?? "compat-read");
  return render(
    <RuntimeCompatibilityProvider access={access}>
      <WidgetAttrProvider instanceId={instanceId}>
        <RuntimeProbe testId="value" initial={options.initial} />
      </WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
}

const error = new RuntimeError({
  code: "TEST_SOURCE_ERROR",
  category: "resource_error",
  message: "test source failed",
});

describe("M04-S2 useAttr compatibility projection", () => {
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

  test("compat-read fails closed when the selected Runtime Source is unavailable", () => {
    const access = compatibilityAccess<number>(undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(
        <RuntimeCompatibilityProvider access={access}>
          <WidgetAttrProvider instanceId={M04_SLICE_2_RUNTIME_READ_TARGET.instanceId}>
            <RuntimeProbe testId="missing" />
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

    // The Source remains usable after the widget subscription goes away.
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
            <WidgetAttrProvider instanceId={M04_SLICE_2_RUNTIME_READ_TARGET.instanceId}>
              <RuntimeProbe testId="first" />
            </WidgetAttrProvider>
          ) : null}
          <WidgetAttrProvider instanceId={M04_SLICE_2_RUNTIME_READ_TARGET.instanceId}>
            <RuntimeProbe testId="second" />
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

  test("compat-read cuts over exactly the selected Status instance while other widgets remain legacy", () => {
    const source = new FakeSource<number>({ state: "fresh", value: 99, updatedAt: 1 });
    const legacyInstance = "tabs.items.home.grids.items.rtkRollPitchStatus";
    renderRuntimeProbe(source, { initial: 1, instanceId: legacyInstance });

    expect(source.subscriptions).toBe(0);
    expect(screen.getByTestId("value")).toHaveTextContent("1");

    act(() => instanceStore.emit(legacyInstance, M04_SLICE_2_RUNTIME_READ_TARGET.portName, 7));
    expect(screen.getByTestId("value")).toHaveTextContent("7");
  });

  test("legacy mode remains an explicit rollback path for the selected widget", () => {
    const source = new FakeSource<boolean>({ state: "fresh", value: true, updatedAt: 1 });
    const access = compatibilityAccess(source, "legacy");
    const instanceId = M04_SLICE_2_RUNTIME_READ_TARGET.instanceId;

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

  test("the selected Status widget renders directly from the Runtime Source in compat-read", () => {
    const source = new FakeSource<boolean>({ state: "fresh", value: true, updatedAt: 1 });
    const access = compatibilityAccess(source);

    render(
      <RuntimeCompatibilityProvider access={access}>
        <WidgetAttrProvider instanceId={M04_SLICE_2_RUNTIME_READ_TARGET.instanceId}>
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
