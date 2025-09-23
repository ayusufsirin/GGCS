// ---- Widget registry (extend as you add widgets) ----
import React from "react";
import { HUDWidget } from "./HUDWidget";
import { MapWidget } from "./MapWidget";
import { SampleWidget } from "./SampleWidget";
import { DiagnosticsWidget } from "./DiagnosticsWidget";

export const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  sample: SampleWidget,
  diagnostics: DiagnosticsWidget,
  // settings: SettingsWidget, // <-- add if you have it
};
