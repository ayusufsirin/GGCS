import React, { useEffect, useState } from "react";
import { useAttr } from "../middleware/hooks/use-attr";
import { useServiceCall } from "../middleware/hooks/use-service";

interface RelayState {
  gpio: string;
  active_low: boolean;
  current_state: "ON" | "OFF";
  transitions: number;
}

interface RelayNode {
  nodeName: string;
  level: number;
  service: string;
  relays: Map<string, RelayState>;
}

interface SetParametersRequest {
  parameters: Array<{
    name: string;
    value: {
      type: number;
      bool_value: boolean;
    };
  }>;
}

interface SetParametersResponse {
  results: Array<{
    successful: boolean;
  }>;
}

export function RelayManagerWidget() {
  const diagnostics = useAttr<any>("diagnostics");
  const { call: setParameters, pending } = useServiceCall<SetParametersRequest, SetParametersResponse>("setRelayParameters");
  
  const [nodes, setNodes] = useState<Map<string, RelayNode>>(new Map());
  const [pendingRelays, setPendingRelays] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!diagnostics || !diagnostics.status) return;

    const newNodes = new Map<string, RelayNode>();

    for (const status of diagnostics.status) {
      // Filter for relay diagnostics
      if (!/Relays/i.test(status.name)) continue;

      const kv: Record<string, string> = {};
      for (const kvp of status.values || []) {
        kv[kvp.key] = kvp.value;
      }

      const nodeName = kv["node_name"] || status.name.replace(/:?\s*Relays/i, "").trim() || "unknown";
      const service = kv["service_set_parameters"] || `/relay_manager/set_parameters`;
      const level = status.level || 0;

      const relays = new Map<string, RelayState>();

      // Discover relays by finding keys ending with .gpio
      const relayNames = Object.keys(kv)
        .filter(k => k.endsWith(".gpio"))
        .map(k => k.slice(0, -5));

      for (const relayName of relayNames) {
        relays.set(relayName, {
          gpio: kv[`${relayName}.gpio`] || "",
          active_low: kv[`${relayName}.active_low`] === "true",
          current_state: (kv[`${relayName}.current_state`] || "OFF").toUpperCase() as "ON" | "OFF",
          transitions: parseInt(kv[`${relayName}.transitions`] || "0", 10),
        });
      }

      newNodes.set(nodeName, {
        nodeName,
        level,
        service,
        relays,
      });
    }

    setNodes(newNodes);
  }, [diagnostics]);

  const toggleRelay = async (nodeName: string, relayName: string, currentState: "ON" | "OFF") => {
    const key = `${nodeName}::${relayName}`;
    setPendingRelays(prev => new Set(prev).add(key));

    const desiredState = currentState === "ON" ? false : true;

    try {
      await setParameters({
        parameters: [
          {
            name: `relay_states.${relayName}`,
            value: {
              type: 1, // PARAMETER_BOOL
              bool_value: desiredState,
            },
          },
        ],
      });
    } catch (error) {
      console.error("Failed to toggle relay:", error);
    } finally {
      // Keep pending state for a bit to allow diagnostics to update
      setTimeout(() => {
        setPendingRelays(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 500);
    }
  };

  if (nodes.size === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.status}>Waiting for diagnostics...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {Array.from(nodes.values()).map(node => (
        <div key={node.nodeName} style={styles.nodeCard}>
          <div style={styles.nodeHeader}>
            <div style={styles.nodeTitle}>{node.nodeName}</div>
            <div style={styles.nodeSub}>
              <span style={styles.pill}>svc: {node.service}</span>
              {node.level === 1 && <span style={styles.warn}> WARN</span>}
              {node.level >= 2 && <span style={styles.warn}> ERROR</span>}
            </div>
          </div>
          <div style={styles.relays}>
            {Array.from(node.relays.entries()).map(([relayName, relay]) => {
              const key = `${node.nodeName}::${relayName}`;
              const isPending = pendingRelays.has(key);
              const isOn = relay.current_state === "ON";

              return (
                <div key={relayName} style={styles.relay}>
                  <div style={styles.meta}>
                    <div style={styles.name}>{relayName}</div>
                    <div style={styles.sub}>
                      GPIO {relay.gpio} · {relay.active_low ? "active-low" : "active-high"} · {relay.transitions} changes
                    </div>
                  </div>
                  <button
                    style={{
                      ...styles.toggle,
                      ...(isPending ? styles.togglePending : isOn ? styles.toggleOn : styles.toggleOff),
                    }}
                    disabled={isPending}
                    onClick={() => toggleRelay(node.nodeName, relayName, relay.current_state)}
                  >
                    {isPending ? "..." : isOn ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: {
    padding: "16px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: "16px",
    height: "100%",
    overflow: "auto",
    background: "#0b0f14",
    color: "#e9eef4",
    fontFamily: "system-ui, 'Segoe UI', Roboto, Helvetica, Arial",
    fontSize: "14px",
  } as React.CSSProperties,
  status: {
    color: "#9aa8b4",
    fontSize: "12px",
  } as React.CSSProperties,
  nodeCard: {
    border: "1px solid #1f2a3a",
    borderRadius: "14px",
    background: "#0f141c",
    padding: "12px",
    boxShadow: "0 6px 24px rgba(0, 0, 0, 0.16)",
    height: "fit-content",
  } as React.CSSProperties,
  nodeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
    flexWrap: "wrap",
    gap: "8px",
  } as React.CSSProperties,
  nodeTitle: {
    fontWeight: 600,
  } as React.CSSProperties,
  nodeSub: {
    fontSize: "12px",
    color: "#9aa8b4",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  } as React.CSSProperties,
  pill: {
    fontSize: "11px",
    border: "1px solid #1f2a3a",
    borderRadius: "999px",
    padding: "2px 8px",
    color: "#9aa8b4",
  } as React.CSSProperties,
  warn: {
    color: "#ffb020",
    fontSize: "12px",
    fontWeight: 600,
  } as React.CSSProperties,
  relays: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  } as React.CSSProperties,
  relay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px",
    border: "1px solid #1f2a3a",
    borderRadius: "12px",
    background: "#0b1017",
  } as React.CSSProperties,
  meta: {
    display: "flex",
    flexDirection: "column",
  } as React.CSSProperties,
  name: {
    fontWeight: 600,
  } as React.CSSProperties,
  sub: {
    fontSize: "12px",
    color: "#9aa8b4",
  } as React.CSSProperties,
  toggle: {
    cursor: "pointer",
    border: "none",
    borderRadius: "999px",
    padding: "8px 14px",
    fontWeight: 700,
    minWidth: "74px",
    transition: "all 0.2s ease",
  } as React.CSSProperties,
  toggleOn: {
    background: "#18c36b",
    color: "#062e18",
  } as React.CSSProperties,
  toggleOff: {
    background: "#e44848",
    color: "#3a0d0d",
  } as React.CSSProperties,
  togglePending: {
    background: "#8aa1b1",
    color: "#0c1b26",
    cursor: "not-allowed",
  } as React.CSSProperties,
};
