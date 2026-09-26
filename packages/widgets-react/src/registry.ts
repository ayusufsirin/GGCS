import {
  ReactWidgetRegistry,
  type ReactWidgetImplementation,
} from "@ggcs/renderer-react";
import { STANDARD_WIDGET_IDS } from "@ggcs/widgets";
import { GaugeWidget } from "./GaugeWidget.js";
import { ImageWidget } from "./ImageWidget.js";
import { ProcedureActionWidget } from "./ProcedureActionWidget.js";
import { StatusWidget } from "./StatusWidget.js";

/** Reusable Web widget implementations proven incrementally through M05. */
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
  {
    type: STANDARD_WIDGET_IDS.procedureAction,
    versions: [1],
    component: ProcedureActionWidget,
  },
  {
    type: STANDARD_WIDGET_IDS.image,
    versions: [1],
    component: ImageWidget,
  },
] as const satisfies readonly ReactWidgetImplementation[]);

export function createStandardReactWidgetRegistry(): ReactWidgetRegistry {
  return new ReactWidgetRegistry({ implementations: STANDARD_REACT_WIDGET_IMPLEMENTATIONS });
}
