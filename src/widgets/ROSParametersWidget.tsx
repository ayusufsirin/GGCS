// src/widgets/ROSParametersWidget.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useServiceCall } from "../middleware/hooks/use-service";

type ParamRow = {
  name: string;
  defaultValue: string;
  currentValue: string;
  editValue: string;
};

const LS_KEY = "paramDefaults";

export function ROSParametersWidget() {
  const listNodesSvc = useServiceCall<{}, { nodes: string[] }>("listNodes");
  const getParamNamesSvc = useServiceCall<{}, { names: string[] }>("getParamNames");
  const getParamSvc = useServiceCall<{ name: string }, { value: string }>("getParam");
  const setParamSvc = useServiceCall<{ name: string; value: string }, {}>("setParam");

  // ---- State ----
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [nodes, setNodes] = useState<string[]>([]);
  const [nodesError, setNodesError] = useState<string | undefined>();
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [rows, setRows] = useState<ParamRow[]>([]);
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);

  // LocalStorage helpers for defaults
  const readDefaults = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  }, []);
  const writeDefaults = useCallback((map: Record<string, string>) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }, []);

  const clearDefaults = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  }, []);

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true);
    setNodesError(undefined);
    try {
      const res = await listNodesSvc.call({}, { timeoutMs: 10000 });
      const list = [...(res.nodes ?? [])].sort();
      setNodes(list);
    } catch (e: any) {
      setNodesError(String(e?.message ?? e));
    } finally {
      setLoadingNodes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run once on mount
  useEffect(() => {
    void loadNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadParams = useCallback(async () => {
    setLoadingParams(true);
    try {
      const namesResp = await getParamNamesSvc.call({}, { timeoutMs: 15000 });
      const allNames = namesResp?.names ?? [];
      const filtered = selectedNode
        ? allNames.filter((n) => n.startsWith(selectedNode))
        : allNames;

      const defaultsMap = readDefaults();

      // Fetch all current values in parallel, but don't toggle global loading per item
      const values = await Promise.all(
        filtered.map(async (name) => {
          try {
            const res = await getParamSvc.call({ name }, { timeoutMs: 8000 });
            const cur = String(res?.value ?? "");
            const def = defaultsMap[name] !== undefined ? defaultsMap[name] : cur;
            if (defaultsMap[name] === undefined) defaultsMap[name] = cur;
            return { name, currentValue: cur, defaultValue: def, editValue: cur } as ParamRow;
          } catch {
            const def = defaultsMap[name] ?? "";
            return { name, currentValue: "", defaultValue: def, editValue: "" } as ParamRow;
          }
        })
      );

      writeDefaults(defaultsMap);
      setRows(values);
    } finally {
      setLoadingParams(false);
    }
  }, [getParamNamesSvc, getParamSvc, readDefaults, writeDefaults, selectedNode]);

  const saveParam = useCallback(async (name: string, newValue: string) => {
    setSaving((s) => ({ ...s, [name]: true }));
    try {
      await setParamSvc.call({ name, value: newValue }, { timeoutMs: 10000 });
      setRows((prev) =>
        prev.map((r) => (r.name === name ? { ...r, currentValue: newValue } : r))
      );
    } finally {
      setSaving((s) => {
        const { [name]: _drop, ...rest } = s;
        return rest;
      });
    }
  }, [setParamSvc]);

  const modified = useCallback((r: ParamRow) => r.editValue !== r.defaultValue, []);

  const visibleRows = useMemo(() => {
    const base = rows;
    return showModifiedOnly ? base.filter(modified) : base;
  }, [rows, showModifiedOnly, modified]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", padding: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label htmlFor="nodeSelect">Select Node:</label>
        <select
          id="nodeSelect"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
          style={{ minWidth: 260 }}
        >
          <option value="">All Parameters</option>
          {nodes.map((n) => (
            <option value={n} key={n}>{n}</option>
          ))}
        </select>

        <button disabled={loadingNodes} onClick={() => void loadNodes()}>
          {loadingNodes ? "Loading…" : "Load Nodes"}
        </button>
        <button disabled={loadingParams} onClick={() => void loadParams()}>
          {loadingParams ? "Loading…" : "Load Params"}
        </button>
        <button onClick={() => {
          clearDefaults(); /* keep UI; user can reload */
        }}>
          Clear Defaults
        </button>

        <label style={{ marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={showModifiedOnly}
            onChange={(e) => setShowModifiedOnly(e.target.checked)}
          />{" "}
          Show Modified Only
        </label>
      </div>

      {nodesError && <div style={{ color: "red" }}>Error: {nodesError}</div>}

      <div style={{ position: "relative", flex: 1, overflow: "auto" }}>
        {(loadingNodes || loadingParams) && (
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #3498db",
            borderRadius: "50%",
            width: 40, height: 40, animation: "spin 1s linear infinite"
          }} />
        )}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
          <tr>
            <th style={thStyle}>Parameter Name</th>
            <th style={thStyle}>Default Value</th>
            <th style={thStyle}>Current Value</th>
            <th style={thStyle}>Edit Value</th>
            <th style={thStyle}>Modified</th>
            <th style={thStyle}>Actions</th>
          </tr>
          </thead>
          <tbody>
          {visibleRows.map((r) => {
            const isModified = modified(r);
            const isSaving = saving[r.name];
            return (
              <tr key={r.name} style={{ backgroundColor: isModified ? "#ffd70055" : "transparent" }}>
                <td style={tdStyle}><code>{r.name}</code></td>
                <td style={tdStyle}>{r.defaultValue}</td>
                <td style={tdStyle}>{r.currentValue}</td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={r.editValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((x) => x.name === r.name ? { ...x, editValue: v } : x));
                    }}
                    style={{ width: "100%", padding: 5, boxSizing: "border-box" }}
                  />
                </td>
                <td style={tdStyle}>{isModified ? "Yes" : "No"}</td>
                <td style={tdStyle}>
                  <button
                    disabled={isSaving}
                    onClick={() => void saveParam(r.name, r.editValue)}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            );
          })}
          {!loadingParams && visibleRows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#666" }}>
                No parameters to display
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>

      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: 10,
  textAlign: "left",
  background: "#f7f7f7",
};
const tdStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: 10,
  textAlign: "left",
};