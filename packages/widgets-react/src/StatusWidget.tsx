import React from "react";
import {
  useWidgetInputObservation,
  useWidgetProps,
} from "@ggcs/renderer-react";
import type {
  SemanticThreshold,
  StatusStateMapping,
  StatusValue,
  WidgetSeverity,
} from "@ggcs/widgets";
import { displayObservation } from "./observation.js";
import {
  colorForSeverity,
  iconGlyph,
  stateMappingForValue,
  thresholdForValue,
} from "./semantics.js";

interface StatusSemanticProps {
  readonly label: string;
  readonly unit?: string;
  readonly precision?: number;
  readonly states?: readonly StatusStateMapping[];
  readonly thresholds?: readonly SemanticThreshold[];
  readonly icon?: string;
  readonly hint?: string;
}

function formatStatusValue(value: StatusValue, props: StatusSemanticProps): string {
  if (typeof value === "number") {
    const precision = typeof props.precision === "number" && Number.isFinite(props.precision)
      ? Math.max(0, Math.min(12, Math.trunc(props.precision)))
      : undefined;
    const number = precision === undefined ? String(value) : value.toFixed(precision);
    return props.unit ? `${number} ${props.unit}` : number;
  }
  return String(value);
}

/** Web/React implementation of the renderer-neutral ggcs:status v1 contract. */
export function StatusWidget() {
  const props = useWidgetProps() as unknown as StatusSemanticProps;
  const observation = useWidgetInputObservation<StatusValue>("value");
  const display = displayObservation(observation);
  const value = display.value;

  const stateMapping = value === undefined ? undefined : stateMappingForValue(value, props.states);
  const threshold = typeof value === "number" ? thresholdForValue(value, props.thresholds) : undefined;
  const semanticSeverity: WidgetSeverity = stateMapping?.severity ?? threshold?.severity ?? "unknown";
  const visualSeverity: WidgetSeverity = display.state === "error" ? "error" : semanticSeverity;
  const color = colorForSeverity(visualSeverity);
  const icon = stateMapping?.icon ?? props.icon;
  const glyph = iconGlyph(icon);
  const text = value === undefined
    ? "—"
    : stateMapping?.label ?? threshold?.label ?? formatStatusValue(value, props);

  return (
    <section
      data-ggcs-widget="status"
      data-observation-state={display.state}
      data-severity={visualSeverity}
      style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 4 }}
    >
      {glyph && (
        <span data-ggcs-icon={icon} aria-hidden="true" style={{ color, fontSize: 18, lineHeight: 1 }}>
          {glyph}
        </span>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        <strong>{props.label}</strong>
        <span
          data-ggcs-status-value
          style={{
            display: "inline-flex",
            width: "fit-content",
            padding: "2px 8px",
            borderRadius: 999,
            border: `1px solid ${color}`,
            color,
          }}
        >
          {text}
        </span>
        {props.hint && <small>{props.hint}</small>}
        {display.state !== "fresh" && <small data-ggcs-observation-label>{display.label}</small>}
      </div>
    </section>
  );
}
