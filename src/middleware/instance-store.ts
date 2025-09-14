// instance-store.ts
type Handler<T = any> = (v: T) => void;

class InstanceStore {
  private bus = new Map<string, Set<Handler>>();
  private last = new Map<string, any>(); // optional last-value cache

  private key(instanceId: string, attrName: string) {
    return `${instanceId}::${attrName}`;
  }

  on<T>(instanceId: string, attrName: string, fn: Handler<T>) {
    const k = this.key(instanceId, attrName);
    const s = this.bus.get(k) ?? new Set<Handler>();
    s.add(fn as Handler);
    this.bus.set(k, s);

    // push last value if present (async to avoid sync render loops)
    if (this.last.has(k)) queueMicrotask(() => fn(this.last.get(k)));
    return () => this.off(instanceId, attrName, fn);
  }

  off<T>(instanceId: string, attrName: string, fn: Handler<T>) {
    const k = this.key(instanceId, attrName);
    const s = this.bus.get(k);
    if (!s) return;
    s.delete(fn as Handler);
    if (s.size === 0) this.bus.delete(k);
  }

  emit<T>(instanceId: string, attrName: string, value: T) {
    const k = this.key(instanceId, attrName);
    this.last.set(k, value);
    const s = this.bus.get(k);
    if (!s) return;
    for (const fn of Array.from(s)) fn(value);
  }
}

export const instanceStore = new InstanceStore();
