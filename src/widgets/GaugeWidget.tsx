import React, { useMemo } from "react";
import ReactSpeedometer, { Transition } from "react-d3-speedometer";
import { useAttr } from "../middleware/hooks/use-attr";

type Num = number | undefined;
type Str = string | undefined;

export function GaugeWidget() {
  // Required/expected attrs (with defaults)
  const valueAttr = useAttr<Num>("value");
  const minAttr = useAttr<Num>("min");
  const maxAttr = useAttr<Num>("max");
  const labelAttr = useAttr<Str>("label");

  // Optional
  const unitsAttr = useAttr<Str>("units");            // e.g. "%", "°C"
  const decimalsAttr = useAttr<Num>("decimals");      // 0..3
  const warnAttr = useAttr<Num>("warn");              // threshold
  const dangerAttr = useAttr<Num>("danger");          // threshold
  const segmentsAttr = useAttr<Num>("segments");      // default 5
  const needleColorAttr = useAttr<Str>("needleColor");// e.g. "#111827"

  const min = (minAttr ?? 0) as number;
  const max = (maxAttr ?? 100) as number;
  const value = Math.max(min, Math.min(max, (valueAttr ?? min) as number));
  const label = (labelAttr ?? "") as string;
  const units = (unitsAttr ?? "") as string;
  const decimals = (decimalsAttr ?? 0) as number;
  const segments = Math.min(12, Math.max(2, (segmentsAttr ?? 5) as number));
  const needleColor = (needleColorAttr ?? "#111827") as string;

  // Segment stops (min → warn → danger → max) if thresholds present
  const { stops, colors } = useMemo(() => {
    const baseBlue = "#3b82f6";
    const warn = typeof warnAttr === "number" ? warnAttr : undefined;
    const danger = typeof dangerAttr === "number" ? dangerAttr : undefined;

    // clamp & sort thresholds
    const ths = [min];
    if (warn !== undefined) ths.push(Math.min(max, Math.max(min, warn)));
    if (danger !== undefined) ths.push(Math.min(max, Math.max(min, danger)));
    ths.push(max);

    const uniqueStops = Array.from(new Set(ths)).sort((a, b) => a - b);

    // Color map: normal → blue, warn → amber, danger → red
    let segColors: string[] = [];
    if (warn === undefined && danger === undefined) {
      segColors = new Array(segments).fill(baseBlue);
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
  }, [min, max, warnAttr, dangerAttr, segments]);

  // Width/height: let it fully fill parent
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
      <ReactSpeedometer
        /* sizing: give a large width, it will scale down via parent */
        width={320}
        height={200}
        fluidWidth={true}
        forceRender={true}
        minValue={min}
        maxValue={max}
        value={value}
        customSegmentStops={stops}                // if undefined, lib uses equal segments
        segmentColors={colors}
        segments={stops ? undefined : segments}   // use equal segments only if no custom stops
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
