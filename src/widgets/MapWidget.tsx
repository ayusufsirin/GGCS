import React from "react";
import { useAttr } from "../middleware/widget-attr";

export function MapWidget() {
  const lat = useAttr<number>("latitude");
  const lon = useAttr<number>("longitude");
  const heading = useAttr<number>("heading");

  return <div>
    <div>Map center: {lat ?? "—"}, {lon ?? "—"}</div>
    <br/>
    <div>Heading: {heading ?? "—"}</div>
  </div>;
}
