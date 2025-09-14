// bootstrap.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collectInstanceBindings } from "./middleware/config-scan";
import { attachBindings } from "./middleware/binder";
import { WidgetAttrProvider } from "./middleware/widget-attr";
import { config } from "./config";
import { HUDWidget } from "./widgets/HUDWidget";
import { MapWidget } from "./widgets/MapWidget";
import { UndefinedWidget } from "./widgets/UndefinedWidget";

// ---- Widget registry (extend as you add widgets) ----
const WIDGETS: Record<string, React.ComponentType<any>> = {
  hud: HUDWidget,
  map: MapWidget,
  // settings: SettingsWidget, // <-- add if you have it
};

// ---- Render a single widget instance with isolation ----
function WidgetFrame({ instanceId, name }: { instanceId: string; name: string }) {
  const Comp = WIDGETS[name] ?? UndefinedWidget;
  return (
    <WidgetAttrProvider instanceId={instanceId}>
      <Comp/>
    </WidgetAttrProvider>
  );
}

// ---- Grid renderer (CSS grid) ----
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
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 8,
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
            }}
            title={item.label ?? itemKey}
          >
            <WidgetFrame instanceId={instanceId} name={item.widget?.name}/>
          </div>
        );
      })}
    </div>
  );
}

// ---- Tab body (either single widget or a grid) ----
function TabBody({ tabKey, tab }: { tabKey: string; tab: any }) {
  if (tab?.widget) {
    const instanceId = `tabs.items.${tabKey}`;
    return (
      <div style={{ padding: 8 }}>
        <WidgetFrame instanceId={instanceId} name={tab.widget.name}/>
      </div>
    );
  }

  if (tab?.grids) {
    return (
      <div style={{ padding: 8 }}>
        <GridView tabKey={tabKey} grid={tab.grids}/>
      </div>
    );
  }

  return <div style={{ padding: 8, opacity: 0.6 }}>No layout for this tab.</div>;
}

// ---- Top-level dashboard with auto tabs + grids ----
export function Dashboard() {
  // Build bindings once (or whenever config changes)
  const bindings = useMemo(() => collectInstanceBindings(config), []);
  useEffect(() => {
    const detach = attachBindings(bindings);
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // attach once on mount

  const tabs = (config as any)?.tabs?.items ?? {};
  const tabKeys = Object.keys(tabs);
  const [activeKey, setActiveKey] = useState<string>(tabKeys[0] ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tabs header */}
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

      {/* Active tab body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeKey ? <TabBody tabKey={activeKey} tab={tabs[activeKey]}/> : null}
      </div>
    </div>
  );
}
