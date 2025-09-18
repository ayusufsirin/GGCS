import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAttr } from "../middleware/hooks/use-attr";
import { usePublisher } from "../middleware/hooks/use-publisher";

type Props = {
  // Options passed as props at bootstrap (label/units configurable as "option")
  label?: string;
  units?: string;
};

export function ActuatorWidget({ label = "Actuator", units = "" }: Props) {
  // Constants (from config) for slider bounds
  const min = useAttr<number>("min") ?? 0;
  const max = useAttr<number>("max") ?? 100;

  // Feedback (subscriber) for actual position
  const feedback = useAttr<number>("feedback");

  // Publisher for target (publisher binding, e.g., "setValue")
  const publishTarget = usePublisher("setValue");

  // Local slider state (initialize within [min,max])
  const initial = useMemo(() => {
    const mid = (min + max) / 2;
    return Number.isFinite(mid) ? mid : 0;
  }, [min, max]);
  const [value, setValue] = useState<number>(initial);

  // Settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodic, setPeriodic] = useState<boolean>(false);
  const [freqHz, setFreqHz] = useState<number>(5);

  // Ensure current value stays in-bounds if min/max change
  useEffect(() => {
    setValue((v) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return v;
      return Math.min(Math.max(v, min), max);
    });
  }, [min, max]);

  // Periodic publish loop
  useEffect(() => {
    if (!periodic) return;
    const hz = Number.isFinite(freqHz) && freqHz > 0 ? freqHz : 5;
    const intervalMs = Math.max(10, Math.round(1000 / hz));
    const id = setInterval(() => {
      publishTarget({ data: value });
    }, intervalMs);
    return () => clearInterval(id);
  }, [periodic, freqHz, value, publishTarget]);

  // Publish-on-change when periodic is off
  const onChangeValue = (v: number) => {
    setValue(v);
    if (!periodic) {
      publishTarget({ data: v });
    }
  };

  // Slider feedback marker positioning
  const trackRef = useRef<HTMLDivElement | null>(null);
  const feedbackPct = useMemo(() => {
    if (feedback == null || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
    return ((feedback - min) / (max - min)) * 100;
  }, [feedback, min, max]);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {Number.isFinite(feedback) ? `Feedback: ${feedback}${units ? " " + units : ""}` : "Feedback: —"}
          </div>
          <button
            aria-label="Actuator settings"
            title="Settings"
            onClick={() => setSettingsOpen((s) => !s)}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "inherit",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            ⋮
          </button>
        </div>
      </div>

      {/* Slider area */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 90, textAlign: "right", fontSize: 12, opacity: 0.8 }}>
          {Number.isFinite(min) ? min : 0}
        </div>

        <div style={{ position: "relative", flex: 1 }} ref={trackRef}>
          {/* Native range input for target command */}
          <input
            type="range"
            min={Number.isFinite(min) ? min : 0}
            max={Number.isFinite(max) ? max : 100}
            step="any"
            value={value}
            onChange={(e) => onChangeValue(Number(e.target.value))}
            style={{
              width: "100%",
              appearance: "none",
              height: 4,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 4,
              outline: "none",
            }}
          />
          {/* Feedback marker */}
          {feedbackPct !== undefined && feedbackPct >= 0 && feedbackPct <= 100 && (
            <div
              title={`Feedback: ${feedback}`}
              style={{
                position: "absolute",
                left: `calc(${feedbackPct}% - 5px)`,
                top: -6,
                width: 10,
                height: 10,
                borderRadius: 10,
                background: "deepskyblue",
                boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div style={{ width: 90, fontSize: 12, opacity: 0.8 }}>
          {Number.isFinite(max) ? max : 100}
        </div>
      </div>

      {/* Readout and action */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14 }}>
          Target: <b>{Number.isFinite(value) ? value : "—"}</b>{units ? ` ${units}` : ""}
        </div>
        {!periodic && (
          <button
            onClick={() => publishTarget({ data: value })}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Publish once
          </button>
        )}
      </div>

      {/* Settings popover */}
      {settingsOpen && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: 10,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            rowGap: 8,
            columnGap: 8,
          }}
        >
          <label style={{ alignSelf: "center" }}>Periodic publish</label>
          <input
            type="checkbox"
            checked={periodic}
            onChange={(e) => setPeriodic(e.target.checked)}
          />

          <label style={{ alignSelf: "center" }}>Publish frequency (Hz)</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={freqHz}
            onChange={(e) => {
              const v = Number(e.target.value);
              setFreqHz(Number.isFinite(v) && v > 0 ? v : 5);
            }}
            disabled={!periodic}
            style={{ width: 120 }}
          />

          <div style={{ gridColumn: "1 / span 2", fontSize: 12, opacity: 0.75 }}>
            {periodic
              ? "Publishing target value periodically at the selected frequency."
              : "Publishing only on change or when pressing 'Publish once'."}
          </div>
        </div>
      )}
    </div>
  );
}
