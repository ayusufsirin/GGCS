import React from "react";
import {
  useWidgetInputObservation,
  useWidgetProps,
} from "@ggcs/renderer-react";
import type { SemanticThreshold, WidgetSeverity } from "@ggcs/widgets";
import { displayObservation } from "./observation.js";
import { colorForSeverity, thresholdForValue } from "./semantics.js";

interface GaugeSemanticProps {
  readonly label?: string;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly precision?: number;
  readonly thresholds?: readonly SemanticThreshold[];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatValue(value: number, precision: number, unit?: string): string {
  const text = value.toFixed(Math.max(0, Math.min(12, Math.trunc(precision))));
  return unit ? `${text} ${unit}` : text;
}

/** Web/React implementation of the renderer-neutral ggcs:gauge v1 contract. */
export function GaugeWidget() {
  const props = useWidgetProps() as unknown as GaugeSemanticProps;
  const observation = useWidgetInputObservation<number>("value");
  const display = displayObservation(observation);

  const min = finiteNumber(props.min, 0);
  const configuredMax = finiteNumber(props.max, 100);
  const max = configuredMax > min ? configuredMax : min + 1;
  const precision = finiteNumber(props.precision, 0);
  const rawValue = display.value;
  const value = rawValue === undefined ? undefined : Math.max(min, Math.min(max, rawValue));
  const percentage = value === undefined ? 0 : ((value - min) / (max - min)) * 100;
  const threshold = rawValue === undefined ? undefined : thresholdForValue(rawValue, props.thresholds);
  const semanticSeverity: WidgetSeverity = threshold?.severity ?? "info";
  const visualSeverity: WidgetSeverity = display.state === "error" ? "error" : semanticSeverity;
  const stroke = colorForSeverity(visualSeverity);

  return (
    <section
      data-ggcs-widget="gauge"
      data-observation-state={display.state}
      data-severity={visualSeverity}
      aria-label={props.label ?? "Gauge"}
      style={{ display: "grid", placeItems: "center", gap: 4, width: "100%", height: "100%" }}
    >
      <svg
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        viewBox="0 0 120 72"
        width="100%"
        height="100%"
        style={{ maxWidth: 320, minHeight: 120 }}
      >
        <path
          d="M 10 60 Q 60 4 110 60"
          pathLength={100}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d="M 10 60 Q 60 4 110 60"
          pathLength={100}
          fill="none"
          stroke={stroke}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, Math.min(100, percentage))} 100`}
        />
      </svg>
      {props.label && <strong>{props.label}</strong>}
      <span data-ggcs-gauge-value>
        {value === undefined ? "—" : formatValue(rawValue ?? value, precision, props.unit)}
      </span>
      {threshold?.label && value !== undefined && <small>{threshold.label}</small>}
      {display.state !== "fresh" && <small data-ggcs-observation-label>{display.label}</small>}
    </section>
  );
}
