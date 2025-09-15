// ---- Widget registry (extend as you add widgets) ----
import React from "react";
import { HUDWidget } from "./HUDWidget";
import { MapWidget } from "./MapWidget";
import { SampleWidget } from "./SampleWidget";
import { GaugeWidget } from "./GaugeWidget";

export const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  gauge: GaugeWidget,
  sample: SampleWidget,
  // settings: SettingsWidget, // <-- add if you have it
};
