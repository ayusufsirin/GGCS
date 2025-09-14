// bootstrap.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collectInstanceBindings } from "./middleware/config-scan";
import { attachBindings } from "./middleware/binder";
import { WidgetAttrProvider } from "./middleware/widget-attr";
import { config } from "./config";
import { WIDGETS } from "./widgets/widgets";
import { FallbackWidget } from "./widgets/FallbackWidget";

// ---- Render a single widget instance with isolation ----
function WidgetFrame({ instanceId, name }: { instanceId: string; name: string }) {
  const Comp = WIDGETS[name] ?? FallbackWidget;
  return (
    <WidgetAttrProvider instanceId={instanceId}>
      <Comp/>
    </WidgetAttrProvider>
  );
}

// ---- Grid renderer (CSS grid) ----
// GridView(): make the grid itself 100% tall, and rows share space evenly
function GridView({
                    tabKey,
                    grid,
                  }: {
  tabKey: string;
  grid: {
    horizontal: number;
    vertical: number;
    items: Record<string,
      {
        label?: string;
        width: number;
        height: number;
        x: number;
        y: number;
        widget: { name: string; config?: Record<string, unknown> };
      }>;
  };
}) {
  const cols = grid.horizontal ?? 12;
  const rows = grid.vertical ?? 8;

  return (
    <div
      style={{
        display: "grid",
        height: "100%", // ← CHANGED (let the grid fill available height)
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, // ← CHANGED (equal-height rows, clamp content)
        gap: 8,
        minHeight: 0, // helpful inside flex
      }}
    >
      {Object.entries(grid.items ?? {}).map(([itemKey, item]) => {
        const instanceId = `tabs.items.${tabKey}.grids.items.${itemKey}`;
        return (
          <div
            key={itemKey}
            style={{
              gridColumn: `${(item.x ?? 0) + 1} / span ${item.width ?? 1}`,
              gridRow: `${(item.y ?? 0) + 1} / span ${item.height ?? 1}`,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: 8,
              height: "100%",              // ← CHANGED (tile fills its grid area)
              display: "flex",             // optional: let widget stretch
              flexDirection: "column",
              minHeight: 0,
            }}
            title={item.label ?? itemKey}
          >
            <div style={{ flex: 1, minHeight: 0 /* optional wrapper for scrollable content */ }}>
              <WidgetFrame instanceId={instanceId} name={item.widget?.name}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Tab body (either single widget or a grid) ----
// TabBody(): ensure inner container fills its parent (minus padding)
function TabBody({ tabKey, tab }: { tabKey: string; tab: any }) {
  if (tab?.widget) {
    const instanceId = `tabs.items.${tabKey}`;
    return (
      <div style={{ padding: 8, height: "100%", boxSizing: "border-box" /* ← CHANGED */ }}>
        <WidgetFrame instanceId={instanceId} name={tab.widget.name}/>
      </div>
    );
  }

  if (tab?.grids) {
    return (
      <div style={{ padding: 8, height: "100%", boxSizing: "border-box" /* ← CHANGED */ }}>
        <GridView tabKey={tabKey} grid={tab.grids}/>
      </div>
    );
  }

  return <div style={{ padding: 8, height: "100%", boxSizing: "border-box" }}>No layout for this tab.</div>;
}

// ---- Top-level dashboard with auto tabs + grids ----
// Dashboard(): make the whole app take the viewport height
export function Dashboard() {
  const bindings = useMemo(() => collectInstanceBindings(config), []);
  useEffect(() => {
    const detach = attachBindings(bindings);
    return () => detach();
  }, [bindings]); // attach once

  const tabs = (config as any)?.tabs?.items ?? {};
  const tabKeys = Object.keys(tabs);
  const [activeKey, setActiveKey] = useState<string>(tabKeys[0] ?? "");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",           // ← CHANGED (ensure full viewport height)
      }}
    >
      <div style={{ display: "flex", gap: 8, padding: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {tabKeys.map((k) => {
          const label = tabs[k]?.label ?? k;
          const active = k === activeKey;
          return (
            <button
              key={k}
              onClick={() => setActiveKey(k)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Active tab body fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 /* ← CHANGED to allow child to size */ }}>
        {activeKey ? <TabBody tabKey={activeKey} tab={tabs[activeKey]}/> : null}
      </div>
    </div>
  );
}
