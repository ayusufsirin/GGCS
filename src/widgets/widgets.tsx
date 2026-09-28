// ---- Widget registry (extend as you add widgets) ----
import React from "react";
import { HUDWidget } from "./HUDWidget";
import { MapWidget } from "./MapWidget";
import { SampleWidget } from "./SampleWidget";
import { ActuatorWidget } from "./ActuatorWidget";
import { GaugeWidget } from "./GaugeWidget";
import { StatusWidget } from "./StatusWidget";
import { DiagnosticsWidget } from "./DiagnosticsWidget";
import { ServiceWidget } from "./ServiceWidget";
import { ImageWidget } from "./ImageWigdet";

export const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  gauge: GaugeWidget,
  sample: SampleWidget,
  actuator: ActuatorWidget,
  status: StatusWidget,
  diagnostics: DiagnosticsWidget,
  service: ServiceWidget,
  image: ImageWidget,
};
