import { collectBindings } from "../config-scan";
import { instanceStore } from "../instance-store";
import { ValueTypes } from "../../interfaces";

export type ConstantBinding = {
  instanceId: string; // widget instance path
  attrName: string;   // attribute name (e.g., "title")
  value: unknown;     // literal value taken from config
};

export function attachConstantBindings(bindings?: ConstantBinding[]) {
  const list = bindings ?? collectConstantBindings((globalThis as any).config);

  // Emit once; widgets using useAttr will receive the value.
  for (const b of list) {
    instanceStore.emit(b.instanceId, b.attrName, b.value);
  }

  // For symmetry with other binders, return a detach function.
  // If you expect config to change dynamically, this can be extended.
  return () => {
  };
}

export function collectConstantBindings(config: unknown): ConstantBinding[] {
  return collectBindings<ConstantBinding>(
    config,
    // match
    (e) => e.type === ValueTypes.constant && ValueTypes.constant in e,
    // map
    ({ instanceId, attrName, entry }) => {
      return { instanceId, attrName, value: (entry as any).constant };
    }
  );
}