import React from "react";
import { useAttr } from "../middleware/hooks/use-attr";
import {
  Activity,
  Antenna,
  CheckCircle2,
  Cpu,
  Gauge,
  LucideIcon,
  Power,
  Satellite,
  Thermometer,
  Wifi,
  XCircle,
} from "lucide-react";

/* ----------------------------- Types ----------------------------- */

type IconName =
  | "satellite"
  | "power"
  | "wifi"
  | "cpu"
  | "thermo"
  | "gauge"
  | "antenna"
  | "activity"
  | "ok"
  | "error";

const IconMap: Record<IconName, LucideIcon> = {
  satellite: Satellite,
  power: Power,
  wifi: Wifi,
  cpu: Cpu,
  thermo: Thermometer,
  gauge: Gauge,
  antenna: Antenna,
  activity: Activity,
  ok: CheckCircle2,
  error: XCircle,
};

type NumberThreshold = { min: number; color: string };

export type StatusWidgetProps = {
  /** Static label text */
  label: string;

  /** "number" for numeric value, "boolean" for on/off */
  kind: "number" | "boolean";

  /** Attribute name that provides the live value */
  valueAttr: string;

  /** Optional base icon (overridden by on/off specific icons for boolean) */
  icon?: IconName;

  /** Compact layout */
  dense?: boolean;

  /** Icon size (px) */
  iconSize?: number;

  /** Fallback when value is undefined */
  empty?: string;

  /* ----- Number options ----- */
  unit?: string;
  decimals?: number; // e.g., 0 for integer
  thresholds?: NumberThreshold[]; // color by value >= min

  /* ----- Boolean options ----- */
  onText?: string;
  offText?: string;
  onColor?: string;
  offColor?: string;
  onIconName?: IconName;
  offIconName?: IconName;

  /** Small hint text under the value */
  hint?: string;
};

/* --------------------------- Helpers ---------------------------- */

function pickIcon(name?: IconName): LucideIcon | null {
  if (!name) return null;
  return IconMap[name] ?? null;
}

function colorByThreshold(v: number, th?: NumberThreshold[]): string | undefined {
  if (!th || th.length === 0) return undefined;
  const sorted = [...th].sort((a, b) => b.min - a.min);
  return sorted.find(t => v >= t.min)?.color;
}

/* ---------------------------- UI Bits --------------------------- */

function Pill({
                text,
                color,
                title,
                dense,
              }: {
  text: string;
  color?: string;
  title?: string;
  dense?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: dense ? "1px 6px" : "2px 10px",
        borderRadius: 999,
        fontSize: dense ? 9 : 13,
        lineHeight: dense ? "16px" : "18px",
        background: "rgba(0,0,0,0.06)",
        color,
        border: `1px solid ${color ? color + "33" : "rgba(0,0,0,0.08)"}`,
      }}
    >
      {text}
    </span>
  );
}

/* --------------------------- Component -------------------------- */

export function StatusWidget(props: StatusWidgetProps) {
  const {
    label,
    kind,
    valueAttr,
    icon,
    dense = false,
    iconSize = 20,
    empty = "—",
    unit,
    decimals,
    thresholds,

    onText = "On",
    offText = "Off",
    onColor = "#0E9F6E",
    offColor = "#D14343",
    onIconName,
    offIconName,

    hint,
  } = props;

  // Pull the live value from middleware
  const raw = useAttr<any>(valueAttr);

  // Compute icon + text + color depending on kind
  let displayText = empty;
  let color: string | undefined;
  let Icon: LucideIcon | null = pickIcon(icon);

  if (kind === "number") {
    const v = typeof raw === "number" ? raw : undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
      const formatted =
        typeof decimals === "number" ? v.toFixed(decimals) : String(v);
      displayText = unit ? `${formatted} ${unit}` : formatted;
      color = colorByThreshold(v, thresholds);
    }
  } else {
    const v = typeof raw === "boolean" ? raw : undefined;
    if (typeof v === "boolean") {
      displayText = v ? onText : offText;
      color = v ? onColor : offColor;
      const chosen = v ? onIconName ?? icon : offIconName ?? icon;
      Icon = pickIcon(chosen);
    }
  }

  return (
    <div
      style={{
        // border: card ? "1px solid rgba(0,0,0,0.08)" : "none",
        // borderRadius: card ? 12 : 0,
        // padding: card ? 12 : 0,
        // background: card ? "rgba(250,250,250,0.6)" : "transparent",
        padding: 2
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 2,
          alignItems: dense ? "center" : "flex-start",
        }}
      >
        {Icon && <Icon size={iconSize} style={{ opacity: 0.85, color }} />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 600, fontSize: dense ? 9 : 14 }}>{label}</div>
          <div style={{ marginTop: dense ? 0 : 4 }}>
            <Pill text={displayText} color={color} dense={dense} />
          </div>
          {hint && (
            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{hint}</div>
          )}
        </div>
      </div>
    </div>
  );
}
