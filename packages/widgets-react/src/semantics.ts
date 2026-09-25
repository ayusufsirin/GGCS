import type {
  SemanticThreshold,
  StatusStateMapping,
  StatusValue,
  WidgetSeverity,
} from "@ggcs/widgets";

export const SEVERITY_COLORS: Readonly<Record<WidgetSeverity, string>> = Object.freeze({
  ok: "#0e9f6e",
  info: "#2563eb",
  warning: "#d97706",
  error: "#dc2626",
  unknown: "#6b7280",
});

export function thresholdForValue(
  value: number,
  thresholds: readonly SemanticThreshold[] | undefined,
): SemanticThreshold | undefined {
  if (!thresholds?.length) return undefined;
  return [...thresholds]
    .sort((left, right) => right.min - left.min)
    .find((threshold) => value >= threshold.min);
}

export function stateMappingForValue(
  value: StatusValue,
  states: readonly StatusStateMapping[] | undefined,
): StatusStateMapping | undefined {
  return states?.find((mapping) => Object.is(mapping.value, value));
}

export function colorForSeverity(severity: WidgetSeverity | undefined): string {
  return SEVERITY_COLORS[severity ?? "unknown"];
}

export function iconGlyph(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  const glyphs: Readonly<Record<string, string>> = {
    satellite: "◉",
    power: "⏻",
    attitude: "⌁",
    heading: "➤",
    position: "⌖",
    magnetometer: "✥",
    gnss: "◎",
    rtk: "R",
  };
  return glyphs[icon] ?? "•";
}
