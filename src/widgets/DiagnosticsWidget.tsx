import React, { useEffect, useMemo, useState } from "react";
import { useAttr } from "../middleware/hooks/use-attr";

// Minimal ROS 2 diagnostics types (only what we need)
type KeyValue = { key: string; value: string };
type DiagnosticStatus = {
  name: string;
  message: string;
  hardware_id: string;
  level: number;
  values: KeyValue[];
};
type DiagnosticArray = {
  status: DiagnosticStatus[];
};

type Props = {
  // List of DiagnosticStatus.name to show as columns
  names: string[];
  // Optional title to show above the table
  title?: string;
};

/**
 * DiagnosticsWidget
 * - Expects widget config to provide a subscriber attr with key "diagnostics"
 *   of type "diagnostic_msgs/msg/DiagnosticArray"
 * - Props.names defines which DiagnosticStatus.name columns to show
 */
export function DiagnosticsWidget(props: Props) {
  const { names, title } = props;

  // Latest message from the "diagnostics" attribute (configured as a subscriber in config.ts)
  const diagnosticsMsg = useAttr<DiagnosticArray>("diagnostics");

  // Keep last-seen maps per diagnostic name: name -> (key -> value)
  const [byName, setByName] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const msg = diagnosticsMsg as DiagnosticArray | undefined;
    if (!msg || !msg.status || msg.status.length === 0) return;

    setByName((prev) => {
      const next: Record<string, Record<string, string>> = { ...prev };
      for (const st of msg.status) {
        if (!st?.name) continue;
        if (!names.includes(st.name)) continue; // only track selected names
        const kvMap = { ...(next[st.name] ?? {}) };
        for (const kv of st.values ?? []) {
          if (!kv?.key) continue;
          kvMap[kv.key] = kv.value ?? "";
        }
        next[st.name] = kvMap;
      }
      return next;
    });
  }, [diagnosticsMsg, names]);

  // All keys across selected diagnostics (stable, sorted)
  const allKeys = useMemo(() => {
    const s = new Set<string>();
    for (const n of names) {
      const m = byName[n];
      if (!m) continue;
      for (const k of Object.keys(m)) s.add(k);
    }
    return Array.from(s).sort();
  }, [byName, names]);

  // Simple styles
  const thStyle: React.CSSProperties = {
    border: "1px solid #ccc",
    padding: 8,
    textAlign: "left",
    background: "#f7f7f7",
    position: "sticky",
    top: 0,
    zIndex: 1,
  };
  const tdStyle: React.CSSProperties = {
    border: "1px solid #ccc",
    padding: 8,
    textAlign: "left",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", overflow: "hidden" }}>
      {title && <h3 style={{ margin: 0 }}>{title}</h3>}

      <div style={{ overflow: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Key</th>
              {names.map((n) => (
                <th style={thStyle} key={n}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={Math.max(1, names.length + 1)}>
                  No diagnostics received yet
                </td>
              </tr>
            ) : (
              allKeys.map((key) => (
                <tr key={key}>
                  <td style={tdStyle}><code>{key}</code></td>
                  {names.map((n) => (
                    <td style={tdStyle} key={`${n}__${key}`}>
                      {byName[n]?.[key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
