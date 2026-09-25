import React, { useState } from "react";
import type {
  ResolvedGridNode,
  ResolvedLayoutNode,
  ResolvedTabsNode,
  ResolvedWidgetNode,
} from "@ggcs/widgets";
import type { ReactRendererSession } from "./session.js";
import { accessForWidget, ReactRendererProvider, ResolvedWidgetProvider } from "./context.js";
import { ReactWidgetRegistry } from "./registry.js";

function WidgetNodeView(props: {
  readonly node: ResolvedWidgetNode;
  readonly session: ReactRendererSession;
  readonly registry: ReactWidgetRegistry;
}) {
  const access = accessForWidget(props.session.access, props.node.widget);
  const resolution = props.registry.resolve(props.node.widget);
  const Component = resolution.component;
  return (
    <div
      data-ggcs-node-kind="widget"
      data-ggcs-node-id={props.node.id}
      data-ggcs-widget-type={props.node.widget.spec.type}
      data-ggcs-resolution={resolution.kind}
    >
      <ResolvedWidgetProvider instance={props.node.widget} access={access}>
        <Component />
      </ResolvedWidgetProvider>
    </div>
  );
}

function TabsNodeView(props: {
  readonly node: ResolvedTabsNode;
  readonly session: ReactRendererSession;
  readonly registry: ReactWidgetRegistry;
}) {
  const [activeId, setActiveId] = useState(props.node.items[0]?.id ?? "");
  const active = props.node.items.find((item) => item.id === activeId) ?? props.node.items[0];
  return (
    <div data-ggcs-node-kind="tabs" data-ggcs-node-id={props.node.id}>
      <div role="tablist">
        {props.node.items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active?.id === item.id}
            onClick={() => setActiveId(item.id)}
          >
            {item.label ?? item.id}
          </button>
        ))}
      </div>
      {active ? (
        <div role="tabpanel">
          <LayoutNodeView node={active.child} session={props.session} registry={props.registry} />
        </div>
      ) : null}
    </div>
  );
}

function GridNodeView(props: {
  readonly node: ResolvedGridNode;
  readonly session: ReactRendererSession;
  readonly registry: ReactWidgetRegistry;
}) {
  const items = [...props.node.items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return (
    <div
      data-ggcs-node-kind="grid"
      data-ggcs-node-id={props.node.id}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(1, props.node.columns)}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.max(1, props.node.rows)}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-ggcs-grid-item={item.id}
          style={{
            gridColumn: `${item.area.x + 1} / span ${Math.max(1, item.area.width)}`,
            gridRow: `${item.area.y + 1} / span ${Math.max(1, item.area.height)}`,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <LayoutNodeView node={item.child} session={props.session} registry={props.registry} />
        </div>
      ))}
    </div>
  );
}

function LayoutNodeView(props: {
  readonly node: ResolvedLayoutNode;
  readonly session: ReactRendererSession;
  readonly registry: ReactWidgetRegistry;
}): React.ReactElement {
  switch (props.node.kind) {
    case "widget":
      return <WidgetNodeView node={props.node} session={props.session} registry={props.registry} />;
    case "tabs":
      return <TabsNodeView node={props.node} session={props.session} registry={props.registry} />;
    case "grid":
      return <GridNodeView node={props.node} session={props.session} registry={props.registry} />;
    case "stack":
      return (
        <div
          data-ggcs-node-kind="stack"
          data-ggcs-node-id={props.node.id}
          style={{ display: "flex", flexDirection: props.node.orientation === "vertical" ? "column" : "row" }}
        >
          {props.node.items.map((child, index) => (
            <div key={`${props.node.id}:${index}`} style={{ minWidth: 0, minHeight: 0 }}>
              <LayoutNodeView node={child} session={props.session} registry={props.registry} />
            </div>
          ))}
        </div>
      );
  }
}

export function ReactPresentation(props: {
  readonly session: ReactRendererSession;
}): React.ReactElement {
  return (
    <ReactRendererProvider session={props.session}>
      <div
        data-ggcs-presentation={props.session.presentation.id}
        aria-label={props.session.presentation.title}
      >
        <LayoutNodeView
          node={props.session.presentation.root}
          session={props.session}
          registry={props.session.registry}
        />
      </div>
    </ReactRendererProvider>
  );
}
