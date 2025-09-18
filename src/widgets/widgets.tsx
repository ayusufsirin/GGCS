// ---- Widget registry (extend as you add widgets) ----
import React from "react";
import { HUDWidget } from "./HUDWidget";
import { MapWidget } from "./MapWidget";
import { SampleWidget } from "./SampleWidget";
import { ActuatorWidget } from "./ActuatorWidget";
import { SettingsWidget } from "./SettingsWidget";
import { ROSParametersWidget } from "./ROSParametersWidget";

export const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  sample: SampleWidget,
  actuator: ActuatorWidget,
  settings: SettingsWidget, // <-- add if you have it
  rosParameters: ROSParametersWidget,
};
