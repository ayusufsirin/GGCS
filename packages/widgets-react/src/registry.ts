import {
  ReactWidgetRegistry,
  type ReactWidgetImplementation,
} from "@ggcs/renderer-react";
import { STANDARD_WIDGET_IDS } from "@ggcs/widgets";
import { GaugeWidget } from "./GaugeWidget.js";
import { StatusWidget } from "./StatusWidget.js";

/** Initial reusable Web widget implementations proven by M05-S4. */
export const STANDARD_REACT_WIDGET_IMPLEMENTATIONS = Object.freeze([
  {
    type: STANDARD_WIDGET_IDS.gauge,
    versions: [1],
    component: GaugeWidget,
  },
  {
    type: STANDARD_WIDGET_IDS.status,
    versions: [1],
    component: StatusWidget,
  },
] as const satisfies readonly ReactWidgetImplementation[]);

export function createStandardReactWidgetRegistry(): ReactWidgetRegistry {
  return new ReactWidgetRegistry({ implementations: STANDARD_REACT_WIDGET_IMPLEMENTATIONS });
}
