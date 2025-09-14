import React from "react";
import { useAttr } from "../middleware/widget-attr";
import DroneHud from "react-drone-hud";

// Reusable hook to track an element's rendered size
function useElementSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      const { clientWidth: w, clientHeight: h } = el;
      setSize(s => (s.width !== w || s.height !== h ? { width: w, height: h } : s));
    };

    // Initial measure (after layout)
    frame = requestAnimationFrame(update);

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    ro.observe(el);

    // Window resize fallback (rare but cheap)
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { ref, ...size };
}

function HUD(props: {
  pitch: number;
  roll: number;
  heading?: number;
  airspeed?: number;
  altitude?: number;
  airspeedTickSize?: number;
  altitudeTickSize?: number;
}) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();

  console.debug(ref, width, height);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative", // helps in grid/absolute layouts
        overflow: "hidden",
      }}
    >
      {/* Render only when we have real pixels */}
      {width > 0 && height > 0 && (
        <DroneHud
          width={width}
          height={height}
          pitch={props.pitch}
          roll={props.roll}
          heading={props.heading}
          airspeed={props.airspeed}
          altitude={props.altitude}
        />
      )}
    </div>
  );
}

export function HUDWidget() {
  const roll = useAttr<number>("roll") as number;
  const pitch = useAttr<number>("pitch") as number;
  const heading = useAttr<number>("heading") as number;
  const speed = useAttr<number>("speed") as number;
  const altitude = useAttr<number>("altitude") as number;
  return (
    <HUD
      roll={roll} //degrees, -ve -> left bank
      pitch={pitch} //degrees
      heading={heading} //degrees, optional
      airspeed={speed} //left-side number, optional
      altitude={altitude} //right-side number, optional
    />
  );
}
