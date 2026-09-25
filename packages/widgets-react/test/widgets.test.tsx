import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  RuntimeError,
  type Observation,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  ResolvedWidgetProvider,
  type ResolvedWidgetAccess,
} from "@ggcs/renderer-react";
import {
  STANDARD_WIDGET_IDS,
  gaugeWidgetSpec,
  statusWidgetSpec,
  type ResolvedWidgetInstance,
  type StatusValue,
} from "@ggcs/widgets";
import {
  GaugeWidget,
  StatusWidget,
  createStandardReactWidgetRegistry,
} from "../src/index.js";

function sourceOf<T>(observation: Observation<T>): Source<T> {
  return {
    kind: "source",
    id: "test.source" as never,
    current: () => observation,
    subscribe: () => ({ unsubscribe() {} }) as Subscription,
  };
}

function markup<T>(options: {
  readonly component: React.ComponentType;
  readonly spec: typeof gaugeWidgetSpec | typeof statusWidgetSpec;
  readonly props: Readonly<Record<string, unknown>>;
  readonly observation: Observation<T>;
}): string {
  const source = sourceOf(options.observation);
  const access: ResolvedWidgetAccess = {
    input: <V,>() => source as unknown as Source<V>,
    command: () => undefined,
    procedure: () => undefined,
    capability: () => undefined,
  };
  const instance: ResolvedWidgetInstance = {
    id: "test.widget" as never,
    spec: options.spec,
    props: options.props as never,
  };
  const Component = options.component;
  return renderToStaticMarkup(
    <ResolvedWidgetProvider instance={instance} access={access}>
      <Component />
    </ResolvedWidgetProvider>,
  );
}

const failure = new RuntimeError({
  code: "test_failure",
  category: "resource_error",
  message: "test failure",
});

describe("semantic React widgets", () => {
  test("gauge renders fresh numeric value with semantic thresholds", () => {
    const html = markup({
      component: GaugeWidget,
      spec: gaugeWidgetSpec,
      props: {
        label: "Speed",
        unit: "m/s",
        min: 0,
        max: 20,
        precision: 1,
        thresholds: [{ min: 10, severity: "warning", label: "Fast" }],
      },
      observation: { state: "fresh", value: 12.25, updatedAt: 1 },
    });
    expect(html).toContain('data-ggcs-widget="gauge"');
    expect(html).toContain('data-observation-state="fresh"');
    expect(html).toContain('data-severity="warning"');
    expect(html).toContain("12.3 m/s");
    expect(html).toContain("Fast");
  });

  test("gauge preserves stale/unavailable/error observation states", () => {
    const stale = markup({
      component: GaugeWidget,
      spec: gaugeWidgetSpec,
      props: { label: "Speed" },
      observation: { state: "stale", value: 4, updatedAt: 1, staleSince: 2 },
    });
    expect(stale).toContain('data-observation-state="stale"');
    expect(stale).toContain("Stale");

    const unavailable = markup({
      component: GaugeWidget,
      spec: gaugeWidgetSpec,
      props: { label: "Speed" },
      observation: { state: "unavailable", since: 1 },
    });
    expect(unavailable).toContain('data-observation-state="unavailable"');
    expect(unavailable).toContain("Unavailable");

    const error = markup({
      component: GaugeWidget,
      spec: gaugeWidgetSpec,
      props: { label: "Speed", precision: 0 },
      observation: {
        state: "error",
        error: failure,
        occurredAt: 3,
        lastGood: { state: "fresh", value: 7, updatedAt: 2 },
      },
    });
    expect(error).toContain('data-observation-state="error"');
    expect(error).toContain('data-severity="error"');
    expect(error).toContain(">7<");
    expect(error).toContain("Error");
  });

  test("status maps exact semantic states to label, severity, and renderer icon", () => {
    const html = markup<StatusValue>({
      component: StatusWidget,
      spec: statusWidgetSpec,
      props: {
        label: "GNSS",
        icon: "satellite",
        states: [
          { value: true, label: "Fixed", severity: "ok", icon: "gnss" },
          { value: false, label: "Searching", severity: "warning" },
        ],
      },
      observation: { state: "fresh", value: true, updatedAt: 1 },
    });
    expect(html).toContain('data-ggcs-widget="status"');
    expect(html).toContain('data-severity="ok"');
    expect(html).toContain('data-ggcs-icon="gnss"');
    expect(html).toContain("Fixed");
  });

  test("status applies numeric semantic thresholds and observation degradation", () => {
    const stale = markup<StatusValue>({
      component: StatusWidget,
      spec: statusWidgetSpec,
      props: {
        label: "Satellites",
        unit: "sv",
        thresholds: [
          { min: 0, severity: "error", label: "Poor" },
          { min: 8, severity: "warning", label: "Usable" },
          { min: 15, severity: "ok", label: "Strong" },
        ],
      },
      observation: { state: "stale", value: 10, updatedAt: 1, staleSince: 2 },
    });
    expect(stale).toContain('data-severity="warning"');
    expect(stale).toContain("Usable");
    expect(stale).toContain("Stale");

    const failed = markup<StatusValue>({
      component: StatusWidget,
      spec: statusWidgetSpec,
      props: { label: "Satellites" },
      observation: { state: "error", error: failure, occurredAt: 4 },
    });
    expect(failed).toContain('data-severity="error"');
    expect(failed).toContain("Error");
  });

  test("registry publishes only the S4-proven gauge/status implementations", () => {
    const registry = createStandardReactWidgetRegistry();
    expect(registry.widgetTypes).toEqual([STANDARD_WIDGET_IDS.gauge, STANDARD_WIDGET_IDS.status]);
  });
});
