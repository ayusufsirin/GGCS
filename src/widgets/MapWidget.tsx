import React from "react";
import { useAttr } from "../middleware/widget-attr";

export function MapWidget() {
  const lat = useAttr<number>("latitude");
  const lon = useAttr<number>("longitude");
  const stat = useAttr<number>("gpsStatus");
  return <div>
    <div>Map center: {lat ?? "—"}, {lon ?? "—"}</div>
    <br/>
    <div>Stat: {stat ?? "—"}</div>
  </div>;
}
