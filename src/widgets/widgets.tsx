// ---- Widget registry (extend as you add widgets) ----
import React from "react";
import { HUDWidget } from "./HUDWidget";
import { MapWidget } from "./MapWidget";
import { SampleWidget } from "./SampleWidget";
import { ActuatorWidget } from "./ActuatorWidget";
import { SettingsWidget } from "./SettingsWidget";
import { ROSParametersWidget } from "./ROSParametersWidget";
import { GaugeWidget } from "./GaugeWidget";
import { StatusWidget } from "./StatusWidget";
import { DiagnosticsWidget } from "./DiagnosticsWidget";
import { ServiceWidget } from "./ServiceWidget";

export const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  gauge: GaugeWidget,
  sample: SampleWidget,
  actuator: ActuatorWidget,
  settings: SettingsWidget,
  rosParameters: ROSParametersWidget,
  status: StatusWidget,
  diagnostics: DiagnosticsWidget,
  service: ServiceWidget,
};
