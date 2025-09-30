import React, { useEffect, useState } from "react";
import { useAttr } from "../middleware/hooks/use-attr";
import { useServiceCall } from "../middleware/hooks/use-service";

interface RelayState {
  gpio: string;
  active_low: boolean;
  current_state: "ON" | "OFF";
  transitions: number;
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

type Props = {
  diagnosticsName: string;
};

export function RelayManagerWidget({ diagnosticsName }: Props) {
  const diagnostics = useAttr<any>("diagnostics");
  const { call: setParameters, } = useServiceCall<SetParametersRequest, SetParametersResponse>("setRelayParameters");
  
  const [relays, setRelays] = useState<Map<string, RelayState>>(new Map());
  const [level, setLevel] = useState<number>(0);
  const [pendingRelays, setPendingRelays] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!diagnostics || !diagnostics.status) return;

    // Find the specific diagnostic status by name
    const status = diagnostics.status.find((s: any) => s.name === diagnosticsName);
    if (!status) return;

    const kv: Record<string, string> = {};
    for (const kvp of status.values || []) {
      kv[kvp.key] = kvp.value;
    }

    setLevel(status.level || 0);

    const newRelays = new Map<string, RelayState>();

    // Discover relays by finding keys ending with .gpio
    const relayNames = Object.keys(kv)
      .filter(k => k.endsWith(".gpio"))
      .map(k => k.slice(0, -5));

    for (const relayName of relayNames) {
      newRelays.set(relayName, {
        gpio: kv[`${relayName}.gpio`] || "",
        active_low: kv[`${relayName}.active_low`] === "true",
        current_state: (kv[`${relayName}.current_state`] || "OFF").toUpperCase() as "ON" | "OFF",
        transitions: parseInt(kv[`${relayName}.transitions`] || "0", 10),
      });
    }

    setRelays(newRelays);
  }, [diagnostics, diagnosticsName]);

  const toggleRelay = async (relayName: string, currentState: "ON" | "OFF") => {
    setPendingRelays(prev => new Set(prev).add(relayName));

    const desiredState = currentState !== "ON";

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
          next.delete(relayName);
          return next;
        });
      }, 500);
    }
  };

  if (relays.size === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.status}>
          Waiting for diagnostics: <strong>{diagnosticsName}</strong>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.nodeCard}>
        <div style={styles.nodeHeader}>
          <div style={styles.nodeTitle}>{diagnosticsName}</div>
          <div style={styles.nodeSub}>
            {level === 1 && <span style={styles.warn}> WARN</span>}
            {level >= 2 && <span style={styles.warn}> ERROR</span>}
          </div>
        </div>
        <div style={styles.relays}>
          {Array.from(relays.entries()).map(([relayName, relay]) => {
            const isPending = pendingRelays.has(relayName);
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
                  onClick={() => toggleRelay(relayName, relay.current_state)}
                >
                  {isPending ? "..." : isOn ? "ON" : "OFF"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "16px",
    height: "100%",
    overflow: "auto",
    background: "transparent",
    color: "#e9eef4",
    fontFamily: "system-ui, 'Segoe UI', Roboto, Helvetica, Arial",
    fontSize: "14px",
  } as React.CSSProperties,
  status: {
    color: "#9aa8b4",
    fontSize: "14px",
  } as React.CSSProperties,
  nodeCard: {
    border: "1px solid #1f2a3a",
    borderRadius: "14px",
    background: "#0f141c",
    padding: "12px",
    boxShadow: "0 6px 24px rgba(0, 0, 0, 0.16)",
    maxWidth: "800px",
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
