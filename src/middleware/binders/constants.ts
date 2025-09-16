// middleware/binders/constants.ts
import { collectConstantBindings, type ConstantBinding } from "../config-scan";
import { instanceStore } from "../instance-store";

export function attachConstantBindings(bindings?: ConstantBinding[]) {
  const list = bindings ?? collectConstantBindings((globalThis as any).config);

  // Emit once; widgets using useAttr will receive the value.
  for (const b of list) {
    instanceStore.emit(b.instanceId, b.attrName, b.value);
  }

  // For symmetry with other binders, return a detach function.
  // If you expect config to change dynamically, this can be extended.
  return () => {};
}
