import { collectBindings, isObject } from "../config-scan";
import { sharedServices } from "../roslib/shared-service";
import { serviceBus, svcKey } from "../service-bus";
import { Service, ValueTypes } from "../../interfaces";

export type ServiceBinding = {
  instanceId: string; // widget instance path
  attrName: string;   // attribute name the widget will call (e.g., "reset")
  service: Service;   // { name, type }
};

export function attachServiceBindings(bindings: ServiceBinding[]) {
  const offs: Array<() => void> = [];

  for (const b of bindings) {
    const key = svcKey(b.instanceId, b.attrName);
    const off = serviceBus.register(key, (req: any, opts?: { timeoutMs?: number }) =>
      sharedServices.call(b.service, req ?? {}, opts)
    );
    offs.push(off);
  }

  return () => offs.forEach((f) => f());
}

export function collectServiceBindings(config: unknown): ServiceBinding[] {
  return collectBindings<ServiceBinding>(
    config,
    // match
    (e) => e.type === ValueTypes.service && isObject(e.service),
    // map
    ({ instanceId, attrName, entry }) => {
      const service = entry.service as Service;
      return { instanceId, attrName, service };
    }
  );
}
