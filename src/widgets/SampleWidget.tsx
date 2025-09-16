import { useServiceCall } from "../middleware/hooks/use-service";
import { useAttr } from "../middleware/hooks/use-attr";

export function SampleWidget() {
  const speed = useAttr<number>("speed");
  const speedLabel = useAttr<number>("speedLabel");
  const {call: reset, pending: rPending} =
    useServiceCall<{}, { success: boolean; message: string }>("reset");

  return (
    <div>
      <div>{speedLabel}: {speed ?? "—"}</div>
      <button disabled={rPending} onClick={() => reset({})}>
        {rPending ? "Resetting…" : "Reset"}
      </button>
    </div>)
}
