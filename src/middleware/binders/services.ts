// middleware/services.ts
import { type ServiceBinding } from "../config-scan";
import { sharedServices } from "../roslib/shared-service";
import { serviceBus, svcKey } from "../service-bus";

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
