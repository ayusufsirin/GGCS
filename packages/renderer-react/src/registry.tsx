import React from "react";
import type { WidgetTypeId } from "@ggcs/schema";
import type { WidgetSpec } from "@ggcs/widgets";
import type { ResolvedWidgetInstance } from "@ggcs/widgets";
import { useResolvedWidgetInstance } from "./context.js";

export type ReactWidgetComponent = React.ComponentType;

export interface ReactWidgetImplementation {
  readonly type: WidgetTypeId;
  /** Omit to support every currently compatible semantic version for this type. */
  readonly versions?: readonly number[];
  readonly component: ReactWidgetComponent;
  /** Type-specific semantic fallback when exact rendering is unavailable. */
  readonly fallback?: ReactWidgetComponent;
}

export type ReactWidgetResolution =
  | { readonly kind: "exact"; readonly component: ReactWidgetComponent }
  | { readonly kind: "fallback"; readonly component: ReactWidgetComponent }
  | { readonly kind: "unsupported"; readonly component: ReactWidgetComponent };

export interface ReactWidgetRegistryOptions {
  readonly implementations?: readonly ReactWidgetImplementation[];
  readonly genericFallback?: ReactWidgetComponent;
}

function UnsupportedWidget() {
  const instance = useResolvedWidgetInstance();
  return (
    <div role="status" data-ggcs-unsupported-widget={instance.spec.type}>
      Unsupported widget: {instance.spec.type} v{instance.spec.version}
    </div>
  );
}

function supportsVersion(implementation: ReactWidgetImplementation, spec: WidgetSpec): boolean {
  return implementation.versions === undefined || implementation.versions.includes(spec.version);
}

/** Immutable, deterministic semantic widget implementation registry. */
export class ReactWidgetRegistry {
  private readonly implementations: ReadonlyMap<WidgetTypeId, ReactWidgetImplementation>;
  private readonly genericFallback: ReactWidgetComponent;
  readonly widgetTypes: readonly WidgetTypeId[];

  constructor(options: ReactWidgetRegistryOptions = {}) {
    const implementations = new Map<WidgetTypeId, ReactWidgetImplementation>();
    for (const implementation of options.implementations ?? []) {
      if (implementations.has(implementation.type)) {
        throw new Error(`Duplicate React widget implementation for ${implementation.type}`);
      }
      if (implementation.versions?.length === 0) {
        throw new Error(`React widget implementation ${implementation.type} has an empty version list`);
      }
      implementations.set(implementation.type, Object.freeze({ ...implementation }));
    }
    this.implementations = implementations;
    this.widgetTypes = Object.freeze([...implementations.keys()]);
    this.genericFallback = options.genericFallback ?? UnsupportedWidget;
  }

  resolve(instance: ResolvedWidgetInstance): ReactWidgetResolution {
    const implementation = this.implementations.get(instance.spec.type);
    if (implementation && supportsVersion(implementation, instance.spec)) {
      return { kind: "exact", component: implementation.component };
    }
    if (implementation?.fallback) {
      return { kind: "fallback", component: implementation.fallback };
    }
    return { kind: "unsupported", component: this.genericFallback };
  }
}
