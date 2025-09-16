// bootstrap.tsx
import React, { useState } from "react";
import { WidgetAttrProvider } from "./middleware/hooks/common";
import { config } from "./config";
import { WIDGETS } from "./widgets/widgets";
import { FallbackWidget } from "./widgets/FallbackWidget";
import { useAttachAllBindings } from "./middleware/attach-bindings";

// ---------- Shared helpers ----------
const joinPath = (path: string[]) => path.join(".");

type GridItemNode = {
  label?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  widget?: { name: string; config?: Record<string, unknown> };
  tabs?: { items: Record<string, any> };
  grids?: any;
};

type GridNode = {
  horizontal: number;
  vertical: number;
  items: Record<string, GridItemNode>;
};

type TabNode = {
  label?: string;
  widget?: { name: string; config?: Record<string, unknown> };
  tabs?: { items: Record<string, any> };
  grids?: GridNode;
};

type AnyNode = {
  widget?: { name: string; config?: Record<string, unknown> };
  tabs?: { items: Record<string, TabNode> };
  grids?: GridNode;
};

// ---------- Widget frame (ROS-agnostic widgets) ----------
function WidgetFrame({ instanceId, name }: { instanceId: string; name: string }) {
  const Comp = WIDGETS[name] ?? FallbackWidget;
  return (
    <WidgetAttrProvider instanceId={instanceId}>
      <Comp />
    </WidgetAttrProvider>
  );
}

// ---------- Recursive node renderer ----------
function RenderNode({ node, path }: { node: AnyNode; path: string[] }) {
  // Precedence: tabs > grids > widget
  if (node?.tabs?.items) {
    return <TabsView tabs={node.tabs.items} path={path} />;
  }
  if (node?.grids) {
    return <GridView grid={node.grids} path={path} />;
  }
  if (node?.widget) {
    const instanceId = joinPath(path);
    return (
      <div style={{ height: "100%", boxSizing: "border-box" }}>
        <WidgetFrame instanceId={instanceId} name={node.widget.name} />
      </div>
    );
  }
  return <div style={{ opacity: 0.6, padding: 8 }}>No content</div>;
}

// ---------- Tabs (recursive) ----------
function TabsView({
                    tabs,
                    path,
                  }: {
  tabs: Record<string, TabNode>;
  path: string[];
}) {
  const keys = Object.keys(tabs);
  const [active, setActive] = useState<string>(keys[0] ?? "");
  const activeNode = active ? tabs[active] : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 8, padding: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {keys.map((k) => {
          const label = tabs[k]?.label ?? k;
          const isActive = k === active;
          return (
            <button
              key={k}
              onClick={() => setActive(k)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
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

      <div style={{ flex: 1, minHeight: 0 }}>
        {activeNode ? (
          <div style={{ height: "100%", boxSizing: "border-box", padding: 8 }}>
            <RenderNode node={activeNode as AnyNode} path={[...path, "tabs", "items", active]} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Grid (recursive) ----------
function GridView({
                    grid,
                    path,
                  }: {
  grid: GridNode;
  path: string[];
}) {
  const cols = Math.max(1, grid.horizontal ?? 12);
  const rows = Math.max(1, grid.vertical ?? 8);

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const occupied = new Set<string>();
  const markCells = (y0: number, x0: number, h: number, w: number, id: string) => {
    let overlap = false;
    for (let r = y0; r < y0 + h; r++) {
      for (let c = x0; c < x0 + w; c++) {
        const key = `${r},${c}`;
        if (occupied.has(key)) overlap = true;
        occupied.add(key);
      }
    }
    if (overlap) console.warn(`[grid:${joinPath(path)}] overlap detected for "${id}" at (${x0},${y0}) span ${w}x${h}`);
  };

  return (
    <div
      style={{
        display: "grid",
        height: "100%",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gridAutoColumns: "minmax(0, 1fr)",
        gridAutoRows: "minmax(0, 1fr)",
        gap: 8,
        minHeight: 0,
        // optional faint gridlines without affecting layout:
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
        `,
        backgroundSize: `calc(100% / ${cols}) 100%, 100% calc(100% / ${rows})`,
        backgroundPosition: "0 0, 0 0",
        backgroundRepeat: "repeat",
      }}
    >
      {Object.entries(grid.items ?? {}).map(([itemKey, item]) => {
        const rawX = Number.isFinite(item.x) ? item.x : 0;
        const rawY = Number.isFinite(item.y) ? item.y : 0;
        const x = clamp(rawX, 0, cols - 1);
        const y = clamp(rawY, 0, rows - 1);
        const maxW = cols - x;
        const maxH = rows - y;
        const wantedW = Number.isFinite(item.width) ? item.width : 1;
        const wantedH = Number.isFinite(item.height) ? item.height : 1;
        const w = clamp(wantedW, 1, Math.max(1, maxW));
        const h = clamp(wantedH, 1, Math.max(1, maxH));

        if (w !== wantedW || h !== wantedH || x !== rawX || y !== rawY) {
          console.warn(
            `[grid:${joinPath(path)}] clamped "${itemKey}" from x:${rawX},y:${rawY},w:${wantedW},h:${wantedH} -> x:${x},y:${y},w:${w},h:${h}`
          );
        }
        markCells(y, x, h, w, itemKey);

        const itemPath = [...path, "grids", "items", itemKey];
        const node: AnyNode = {
          widget: item.widget,
          tabs: item.tabs as any,
          grids: item.grids as any,
        };

        return (
          <div
            key={itemKey}
            style={{
              gridColumn: `${x + 1} / span ${w}`,
              gridRow: `${y + 1} / span ${h}`,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: 8,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
            title={item.label ?? itemKey}
          >
            <div style={{ flex: 1, minHeight: 0 }}>
              <RenderNode node={node} path={itemPath} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Top-level dashboard ----------
export function Dashboard() {
  // Bind once for the whole config (scanner already recursive)
  useAttachAllBindings(config);

  const root: AnyNode = (config as unknown) as AnyNode;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Root can be tabs/grids/widget — we render it recursively */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RenderNode node={root as AnyNode} path={[]} />
      </div>
    </div>
  );
}
