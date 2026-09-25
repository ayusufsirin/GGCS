import type { JsonValue, TypeId, WidgetTypeId } from "@ggcs/schema";

/** Renderer-neutral semantic severity. Renderers decide visual treatment. */
export type WidgetSeverity = "ok" | "info" | "warning" | "error" | "unknown";

export type RendererCapabilityId = string;
export type CapabilityTypeId = string;
export type RendererNeutralIconId = string;

export interface PropertySpec {
  /** Semantic type identity for this static, portable property. */
  readonly type: TypeId;
  readonly required?: boolean;
  readonly defaultValue?: JsonValue;
  readonly description?: string;
}

export interface InputPortSpec {
  /** Semantic Source value type. Renderers consume the corresponding Observation envelope. */
  readonly type: TypeId;
  readonly required?: boolean;
  readonly description?: string;
}

export type ActionTargetKind = "command" | "procedure";

export interface ActionPortSpec {
  readonly target: ActionTargetKind;
  readonly input: TypeId;
  /** Procedure output type. Commands intentionally omit this field. */
  readonly output?: TypeId;
  readonly required?: boolean;
  readonly description?: string;
}

export interface CapabilityPortSpec {
  readonly capability: CapabilityTypeId;
  readonly required?: boolean;
  readonly description?: string;
}

/**
 * Reusable semantic widget contract. This is deliberately not executable UI
 * code and contains no renderer/transport implementation objects.
 */
export interface WidgetSpec {
  readonly type: WidgetTypeId;
  readonly version: number;
  readonly props: Readonly<Record<string, PropertySpec>>;
  readonly inputs: Readonly<Record<string, InputPortSpec>>;
  readonly actions: Readonly<Record<string, ActionPortSpec>>;
  readonly capabilities: Readonly<Record<string, CapabilityPortSpec>>;
  readonly rendererCapabilities?: readonly RendererCapabilityId[];
}

export const WIDGET_CAPABILITY_IDS = {
  parameterProvider: "ggcs:capability/parameter-provider",
} as const;

export const STANDARD_WIDGET_IDS = {
  gauge: "ggcs:gauge",
  status: "ggcs:status",
  attitude: "ggcs:attitude",
  navigationMap: "ggcs:navigation-map",
  procedureAction: "ggcs:procedure-action",
  image: "ggcs:image",
  parameterBrowser: "ggcs:parameter-browser",
  actuator: "ggcs:actuator",
} as const satisfies Record<string, WidgetTypeId>;
