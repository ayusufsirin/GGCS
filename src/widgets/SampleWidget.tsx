import { useServiceCall } from "../middleware/hooks/use-service";
import { useAttr } from "../middleware/hooks/use-attr";
import React, { useState } from "react";
import { usePublisher } from "../middleware/hooks/use-publisher";

export function SampleWidget() {
  const speed = useAttr<number>("speed");
  const targetSpeedLoopback = useAttr<number>("targetSpeed");
  const speedLabel = useAttr<string>("speedLabel");
  const { call: reset, pending: rPending } =
    useServiceCall<{}, { success: boolean; message: string }>("reset");

  // Publisher bound via config (attr: "setSpeed")
  const publishSetSpeed = usePublisher("setSpeed");
  const [targetSpeed, setTargetSpeed] = useState<string>("0");

  const publishSpeed = () => {
    const v = Number(targetSpeed);
    if (!Number.isFinite(v)) return;
    publishSetSpeed({ data: v });
  };

  return (
    <div>
      <div>{speedLabel}: {speed ?? "—"}</div>
      <button disabled={rPending} onClick={() => reset({})}>
        {rPending ? "Resetting…" : "Reset"}
      </button>
      <div style={{ marginTop: 8 }}>
        <label style={{ display: "block", marginBottom: 4 }}>Set target speed</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={targetSpeed}
            onChange={(e) => setTargetSpeed(e.target.value)}
            style={{ width: 120 }}
          />
          <button onClick={publishSpeed}>Publish</button>
        </div>
      </div>
      <div>Target Speed: {targetSpeedLoopback ?? "—"}</div>
    </div>)
}
