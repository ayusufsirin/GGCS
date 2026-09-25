import type { JsonPrimitive, TypeDescriptor } from "@ggcs/schema";
import type { RendererNeutralIconId, WidgetSeverity } from "./contracts.js";

export interface SemanticThreshold {
  readonly min: number;
  readonly severity: WidgetSeverity;
  readonly label?: string;
}

export type StatusValue = Exclude<JsonPrimitive, null>;

export interface StatusStateMapping {
  readonly value: StatusValue;
  readonly label: string;
  readonly severity?: WidgetSeverity;
  readonly icon?: RendererNeutralIconId;
}

export interface GeoPosition {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly altitudeM?: number;
}

export interface NavigationWaypoint {
  readonly position: GeoPosition;
  readonly label?: string;
}

/**
 * Renderer-neutral image payload. `encoding` makes the transport adaptation
 * explicit without making base64 the permanent semantic assumption.
 */
export interface ImageFrame {
  readonly payload: string;
  readonly mimeType: string;
  readonly encoding: "base64" | "uri" | "opaque-reference";
  readonly width?: number;
  readonly height?: number;
  readonly timestamp?: number;
  readonly provenance?: string;
}

export const WIDGET_TYPE_IDS = {
  semanticThresholds: "ggcs:type/widget-thresholds",
  statusValue: "ggcs:type/status-value",
  statusStateMappings: "ggcs:type/status-state-mappings",
  iconId: "ggcs:type/icon-id",
  geoPosition: "ggcs:type/geo-position",
  geoPositionList: "ggcs:type/geo-position-list",
  waypointList: "ggcs:type/navigation-waypoint-list",
  imageFrame: "ggcs:type/image-frame",
} as const;

export const WIDGET_TYPE_DESCRIPTORS = {
  semanticThresholds: {
    id: WIDGET_TYPE_IDS.semanticThresholds,
    title: "Widget semantic thresholds",
    schema: {
      $id: WIDGET_TYPE_IDS.semanticThresholds,
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["min", "severity"],
        properties: {
          min: { type: "number" },
          severity: { enum: ["ok", "info", "warning", "error", "unknown"] },
          label: { type: "string" },
        },
      },
    },
  } satisfies TypeDescriptor<readonly SemanticThreshold[]>,
  statusValue: {
    id: WIDGET_TYPE_IDS.statusValue,
    title: "Status value",
    schema: { $id: WIDGET_TYPE_IDS.statusValue, type: ["boolean", "number", "string"] },
  } satisfies TypeDescriptor<StatusValue>,
  statusStateMappings: {
    id: WIDGET_TYPE_IDS.statusStateMappings,
    title: "Status state mappings",
    schema: {
      $id: WIDGET_TYPE_IDS.statusStateMappings,
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label"],
        properties: {
          value: { type: ["boolean", "number", "string"] },
          label: { type: "string" },
          severity: { enum: ["ok", "info", "warning", "error", "unknown"] },
          icon: { type: "string" },
        },
      },
    },
  } satisfies TypeDescriptor<readonly StatusStateMapping[]>,
  iconId: {
    id: WIDGET_TYPE_IDS.iconId,
    title: "Renderer-neutral icon identifier",
    schema: { $id: WIDGET_TYPE_IDS.iconId, type: "string", minLength: 1 },
  } satisfies TypeDescriptor<string>,
  geoPosition: {
    id: WIDGET_TYPE_IDS.geoPosition,
    title: "Geographic position",
    schema: {
      $id: WIDGET_TYPE_IDS.geoPosition,
      type: "object",
      additionalProperties: false,
      required: ["latitudeDeg", "longitudeDeg"],
      properties: {
        latitudeDeg: { type: "number", minimum: -90, maximum: 90 },
        longitudeDeg: { type: "number", minimum: -180, maximum: 180 },
        altitudeM: { type: "number" },
      },
    },
  } satisfies TypeDescriptor<GeoPosition>,
  geoPositionList: {
    id: WIDGET_TYPE_IDS.geoPositionList,
    title: "Geographic position list",
    schema: {
      $id: WIDGET_TYPE_IDS.geoPositionList,
      type: "array",
      items: { $ref: WIDGET_TYPE_IDS.geoPosition },
    },
  } satisfies TypeDescriptor<readonly GeoPosition[]>,
  waypointList: {
    id: WIDGET_TYPE_IDS.waypointList,
    title: "Navigation waypoint list",
    schema: {
      $id: WIDGET_TYPE_IDS.waypointList,
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["position"],
        properties: {
          position: { $ref: WIDGET_TYPE_IDS.geoPosition },
          label: { type: "string" },
        },
      },
    },
  } satisfies TypeDescriptor<readonly NavigationWaypoint[]>,
  imageFrame: {
    id: WIDGET_TYPE_IDS.imageFrame,
    title: "Image frame",
    schema: {
      $id: WIDGET_TYPE_IDS.imageFrame,
      type: "object",
      additionalProperties: false,
      required: ["payload", "mimeType", "encoding"],
      properties: {
        payload: { type: "string" },
        mimeType: { type: "string", minLength: 1 },
        encoding: { enum: ["base64", "uri", "opaque-reference"] },
        width: { type: "integer", minimum: 1 },
        height: { type: "integer", minimum: 1 },
        timestamp: { type: "number" },
        provenance: { type: "string" },
      },
    },
  } satisfies TypeDescriptor<ImageFrame>,
} as const;
