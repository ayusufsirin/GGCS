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

  // Clamp value when bounds change
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
    const intervalMs = Math.max(20, Math.round(1000 / hz));
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

  // Slider visuals
  const feedbackPct = useMemo(() => {
    if (feedback == null || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
    return ((feedback - min) / (max - min)) * 100;
  }, [feedback, min, max]);

  const valuePct = useMemo(() => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return 0;
    return ((value - min) / (max - min)) * 100;
  }, [value, min, max]);

  // Styles
  const card: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    boxShadow:
      "inset 0 0 0 1px rgba(255,255,255,0.08), 0 4px 18px rgba(0,0,0,0.25)",
  };

  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const titleWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  };

  const title: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const badge: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.85,
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 999,
    padding: "2px 8px",
    background: "rgba(255,255,255,0.06)",
  };

  const headerRight: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const feedbackText: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.85,
    minWidth: 110,
    textAlign: "right",
  };

  const iconBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
    transition: "all .15s ease",
  };

  const sliderRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "64px 1fr 64px",
    alignItems: "center",
    gap: 12,
  };

  const sideLabel: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.75,
    textAlign: "center",
  };

  const sliderWrap: React.CSSProperties = {
    position: "relative",
    height: 28,
    display: "flex",
    alignItems: "center",
  };

  // Range styling trick: base track + progress overlay
  const baseTrack: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: 8,
    borderRadius: 6,
    background: "linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.08))",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
  };

  const progress: React.CSSProperties = {
    position: "absolute",
    left: 0,
    width: `${Math.max(0, Math.min(100, valuePct))}%`,
    height: 8,
    borderRadius: 6,
    background: "linear-gradient(90deg, #4fb3ff, #00e1ff)",
    boxShadow: "0 0 12px rgba(0,225,255,0.25)",
  };

  const range: React.CSSProperties = {
    width: "100%",
    appearance: "none",
    background: "transparent",
    position: "relative",
    zIndex: 1,
    height: 28,
  };

  const readoutRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const pillBtn: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "inherit",
    cursor: "pointer",
    transition: "all .15s ease",
  };

  const settingsCard: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    padding: 12,
    background: "rgba(0,0,0,0.35)",
    boxShadow: "0 8px 26px rgba(0,0,0,0.4)",
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    rowGap: 10,
    columnGap: 10,
  };

  return (
    <div style={card}>
      {/* Header */}
      <div style={header}>
        <div style={titleWrap}>
          <div style={title}>{label}</div>
          {units && <div style={badge}>{units}</div>}
        </div>
        <div style={headerRight}>
          <div style={feedbackText}>
            {Number.isFinite(feedback) ? `Feedback: ${feedback}${units ? " " + units : ""}` : "Feedback: —"}
          </div>
          <button
            aria-label="Actuator settings"
            title="Settings"
            onClick={() => setSettingsOpen((s) => !s)}
            style={iconBtn}
          >
            ⋮
          </button>
        </div>
      </div>

      {/* Slider */}
      <div style={sliderRow}>
        <div style={sideLabel}>{Number.isFinite(min) ? min : 0}</div>

        <div style={sliderWrap}>
          <div style={baseTrack} />
          <div style={progress} />
          {/* Feedback marker */}
          {feedbackPct !== undefined && feedbackPct >= 0 && feedbackPct <= 100 && (
            <div
              title={`Feedback: ${feedback}`}
              style={{
                position: "absolute",
                left: `calc(${feedbackPct}% - 1px)`,
                top: -4,
                width: 2,
                height: 16,
                borderRadius: 2,
                background: "#00e1ff",
                boxShadow: "0 0 10px rgba(0,225,255,0.6)",
                zIndex: 2,
                pointerEvents: "none",
              }}
            />
          )}
          <input
            type="range"
            min={Number.isFinite(min) ? min : 0}
            max={Number.isFinite(max) ? max : 100}
            step="any"
            value={value}
            onChange={(e) => onChangeValue(Number(e.target.value))}
            style={range}
          />
        </div>

        <div style={sideLabel}>{Number.isFinite(max) ? max : 100}</div>
      </div>

      {/* Readout */}
      <div style={readoutRow}>
        <div style={{ fontSize: 14 }}>
          Target: <b>{Number.isFinite(value) ? value : "—"}</b>
          {units ? ` ${units}` : ""}
        </div>
        {!periodic && (
          <button style={pillBtn} onClick={() => publishTarget({ data: value })}>
            Publish once
          </button>
        )}
      </div>

      {/* Settings */}
      {settingsOpen && (
        <div style={settingsCard}>
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

          <div style={{ gridColumn: "1 / span 2", fontSize: 12, opacity: 0.8 }}>
            {periodic
              ? "Target value is published periodically at the chosen frequency."
              : "Target value is published when changed or by pressing 'Publish once'."}
          </div>
        </div>
      )}

      {/* Thumb styles via CSS vars for a more native feel */}
      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid #00e1ff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 0 10px rgba(0,225,255,0.4);
          cursor: pointer;
          margin-top: -5px;
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid #00e1ff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 0 10px rgba(0,225,255,0.4);
          cursor: pointer;
        }
        input[type="range"]::-ms-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid #00e1ff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 0 10px rgba(0,225,255,0.4);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
