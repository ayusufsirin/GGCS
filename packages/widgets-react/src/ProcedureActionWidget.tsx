import React, { useState } from "react";
import type { Invocation } from "@ggcs/core";
import {
  useInvocationState,
  useWidgetProcedure,
  useWidgetProps,
} from "@ggcs/renderer-react";

interface ProcedureActionProps extends Readonly<Record<string, unknown>> {
  readonly label: string;
  readonly pendingLabel?: string;
}

export function ProcedureActionWidget() {
  const props = useWidgetProps() as unknown as ProcedureActionProps;
  const trigger = useWidgetProcedure<void, unknown>("trigger");
  const [invocation, setInvocation] = useState<Invocation<unknown>>();
  const state = useInvocationState(invocation);
  const pending = state?.state === "pending";

  const handleClick = () => {
    if (!trigger || pending) return;
    setInvocation(trigger());
  };

  const status = state?.state === "succeeded"
    ? "Succeeded"
    : state?.state === "failed" || state?.state === "timed_out"
      ? state.error.message
      : undefined;

  return (
    <div
      data-ggcs-widget="procedure-action"
      data-invocation-state={state?.state ?? "idle"}
    >
      <button disabled={!trigger || pending} onClick={handleClick}>
        {pending ? props.pendingLabel ?? "Working..." : props.label}
      </button>
      {status ? <div role="status">{status}</div> : null}
    </div>
  );
}
