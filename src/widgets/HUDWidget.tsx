import React from "react";
import { useAttr } from "../middleware/widget-attr";

export function HUDWidget() {
  const speed = useAttr<number>("speed");
  const accel = useAttr<number>("acceleration");
  const status = useAttr<number>("status");
  return (
    <div>
      <div>Speed: {speed?.toFixed?.(2) ?? "—"} m/s</div>
      <div>Accel: {accel?.toFixed?.(2) ?? "—"} m/s²</div>
      <div>GPS Status: {status?? "—"} m/s²</div>
    </div>
  );
}
