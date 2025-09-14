// bootstrap.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collectInstanceBindings } from "./middleware/config-scan";
import { attachBindings } from "./middleware/binder";
import { WidgetAttrProvider } from "./middleware/widget-attr";
import { config } from "./config";
import { WIDGETS } from "./widgets/widgets";
import { FallbackWidget } from "./widgets/FallbackWidget";

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
  grid: {
    horizontal: number;
    vertical: number;
    items: Record<
      string,
      {
        label?: string;
        width: number;
        height: number;
        x: number;
        y: number;
        widget?: { name: string; config?: Record<string, unknown> };
        tabs?: { items: Record<string, any> };
        grids?: any;
      }
      >;
  };
  path: string[];
}) {
  const cols = Math.max(1, grid.horizontal ?? 12);
  const rows = Math.max(1, grid.vertical ?? 8);

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  type Layout = {
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    overlap: boolean;
    node: any;
    itemPath: string[];
  };

  const entries = Object.entries(grid.items ?? {});
  const layouts: Layout[] = [];
  const cellOwner = new Map<string, number>(); // "r,c" -> layout index
  const overlappedCells = new Set<string>();

  // Precompute layouts + overlaps
  entries.forEach(([itemKey, item], idx) => {
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
        `[grid:${path.join(".")}] clamped "${itemKey}" from x:${rawX},y:${rawY},w:${wantedW},h:${wantedH} -> x:${x},y:${y},w:${w},h:${h}`
      );
    }

    const layout: Layout = {
      key: itemKey,
      x,
      y,
      w,
      h,
      overlap: false,
      node: {
        widget: item.widget,
        tabs: item.tabs as any,
        grids: item.grids as any,
      },
      itemPath: [...path, "grids", "items", itemKey],
    };

    // detect overlaps cell-by-cell
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        const ck = `${r},${c}`;
        const prev = cellOwner.get(ck);
        if (prev === undefined) {
          cellOwner.set(ck, idx);
        } else {
          layout.overlap = true;
          layouts[prev] && (layouts[prev].overlap = true); // flag the previous tile as overlapping too
          overlappedCells.add(ck);
        }
      }
    }

    layouts.push(layout);
  });

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Main grid */}
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
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: `calc(100% / ${cols}) 100%, 100% calc(100% / ${rows})`,
          backgroundPosition: "0 0, 0 0",
          backgroundRepeat: "repeat",
        }}
      >
        {layouts.map((L) => (
          <div
            key={L.key}
            style={{
              gridColumn: `${L.x + 1} / span ${L.w}`,
              gridRow: `${L.y + 1} / span ${L.h}`,
              // normal faint outline; if overlapping, paint strong red
              boxShadow: L.overlap
                ? "inset 0 0 0 2px rgba(244,67,54,0.9)"
                : "inset 0 0 0 1px rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: 8,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
            title={L.key}
          >
            <div style={{ flex: 1, minHeight: 0 }}>
              <RenderNode node={L.node} path={L.itemPath} />
            </div>
          </div>
        ))}
      </div>

      {/* Overlap overlay grid (does not affect layout / clicks) */}
      {overlappedCells.size > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            gap: 8,
          }}
        >
          {Array.from(overlappedCells).map((ck) => {
            const [rStr, cStr] = ck.split(",");
            const r = Number(rStr);
            const c = Number(cStr);
            return (
              <div
                key={ck}
                style={{
                  gridColumn: `${c + 1} / span 1`,
                  gridRow: `${r + 1} / span 1`,
                  background: "rgba(244,67,54,0.22)", // translucent fill
                  boxShadow: "inset 0 0 0 2px rgba(244,67,54,0.85)", // red cell border
                  borderRadius: 6,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Top-level dashboard ----------
export function Dashboard() {
  // Bind once for the whole config (scanner already recursive)
  const bindings = useMemo(() => collectInstanceBindings(config), []);
  useEffect(() => {
    const detach = attachBindings(bindings);
    return () => detach();
  }, [bindings]);

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
