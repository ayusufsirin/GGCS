import type {
  JsonValue,
  PresentationId,
  WidgetInstanceId,
} from "@ggcs/schema";
import type { WidgetSpec } from "./contracts.js";

export type PresentationImportance = "critical" | "normal" | "decorative";
export type RendererHintMap = Readonly<Record<string, JsonValue>>;

/** Renderer-neutral compiled widget metadata; runtime handles are supplied separately by renderer access. */
export interface ResolvedWidgetInstance {
  readonly id: WidgetInstanceId;
  readonly spec: WidgetSpec;
  readonly props: Readonly<Record<string, JsonValue>>;
  readonly rendererHints?: RendererHintMap;
}

export interface ResolvedWidgetNode {
  readonly kind: "widget";
  readonly id: string;
  readonly widget: ResolvedWidgetInstance;
  readonly importance?: PresentationImportance;
}

export interface ResolvedTabItem {
  readonly id: string;
  readonly label?: string;
  readonly child: ResolvedLayoutNode;
}

export interface ResolvedTabsNode {
  readonly kind: "tabs";
  readonly id: string;
  readonly items: readonly ResolvedTabItem[];
}

export interface ResolvedGridArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResolvedGridItem {
  readonly id: string;
  /** Deterministic fallback/source order independent from physical geometry. */
  readonly order: number;
  readonly area: ResolvedGridArea;
  readonly child: ResolvedLayoutNode;
}

export interface ResolvedGridNode {
  readonly kind: "grid";
  readonly id: string;
  readonly columns: number;
  readonly rows: number;
  readonly items: readonly ResolvedGridItem[];
}

export interface ResolvedStackNode {
  readonly kind: "stack";
  readonly id: string;
  readonly orientation: "vertical" | "horizontal";
  readonly items: readonly ResolvedLayoutNode[];
}

export type ResolvedLayoutNode =
  | ResolvedWidgetNode
  | ResolvedTabsNode
  | ResolvedGridNode
  | ResolvedStackNode;

/**
 * Renderer-neutral compiled presentation structure. Runtime access is intentionally
 * not embedded here; renderers receive a separate narrow PresentationAccess.
 */
export interface ResolvedPresentation {
  readonly id: PresentationId;
  readonly title?: string;
  readonly root: ResolvedLayoutNode;
  readonly rendererHints?: RendererHintMap;
}
