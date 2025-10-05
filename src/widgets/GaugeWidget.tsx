import React, { useMemo } from "react";
import ReactSpeedometer, { Transition } from "react-d3-speedometer";
import { useAttr } from "../middleware/hooks/use-attr";

type Props = {
  min?: number
  max?: number
  label?: string
  units?: string
  decimals?: number
  warn?: number
  danger?: number
  segments?: number
  needleColor?: string
};

export function GaugeWidget({
                              min = 0,
                              max = 100,
                              label = "",
                              units = "",
                              decimals = 0,
                              warn = undefined,
                              danger = undefined,
                              segments = 5,
                              needleColor = "#111827",
                            }: Props) {
  // Required/expected attrs (with defaults)
  const valueAttr = useAttr<number | undefined>("value");
  const value = Math.max(min, Math.min(max, (valueAttr ?? min) as number));
  const _segments = Math.min(12, Math.max(2, (segments ?? 5) as number));

  // Segment stops (min → warn → danger → max) if thresholds present
  const { stops, colors } = useMemo(() => {
    const baseBlue = "#3b82f6";

    // clamp & sort thresholds
    const ths = [min];
    if (warn !== undefined) ths.push(Math.min(max, Math.max(min, warn)));
    if (danger !== undefined) ths.push(Math.min(max, Math.max(min, danger)));
    ths.push(max);

    const uniqueStops = Array.from(new Set(ths)).sort((a, b) => a - b);

    // Color map: normal → blue, warn → amber, danger → red
    let segColors: string[] = [];
    if (warn === undefined && danger === undefined) {
      segColors = new Array(_segments).fill(baseBlue);
      return {
        stops: undefined as unknown as number[], // let library auto segment
        colors: segColors,
      };
    } else {
      segColors = uniqueStops.slice(0, -1).map((start, i) => {
        const end = uniqueStops[i + 1];
        if (danger !== undefined && start >= danger) return "#ef4444";
        if (danger !== undefined && end > danger) return "#ef4444";
        if (warn !== undefined && (start >= warn || end > warn)) return "#f59e0b";
        return baseBlue;
      });
      return { stops: uniqueStops, colors: segColors };
    }
  }, [min, max, _segments]);

  // Width/height: let it fully fill parent
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
      <ReactSpeedometer
        /* sizing: give a large width, it will scale down via parent */
        width={320}
        height={200}
        fluidWidth={true}
        // forceRender={true}
        minValue={min}
        maxValue={max}
        value={value}
        customSegmentStops={stops}                // if undefined, lib uses equal segments
        segmentColors={colors}
        segments={stops ? undefined : _segments}   // use equal segments only if no custom stops
        needleColor={needleColor}
        needleTransitionDuration={250}
        needleTransition={Transition.easeQuadOut}
        ringWidth={30}
        currentValueText={
          label || units
            ? `${label ? label + ": " : ""} ${value.toFixed(decimals)} ${units ? units : ""}`
            : `${value.toFixed(decimals)}`
        }
        valueFormat={`.${decimals}f`}
        textColor="#111827"
        /* Hide the default min/max display to keep it clean */
        // minLabel=""
        // maxLabel=""
      />
    </div>
  );
}
