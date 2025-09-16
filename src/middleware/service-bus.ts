// middleware/service-bus.ts
type Invoke = (req: any, opts?: { timeoutMs?: number }) => Promise<any>;

class ServiceBus {
  private invokers = new Map<string, Invoke>(); // key = instanceId::attrName

  register(key: string, fn: Invoke) {
    this.invokers.set(key, fn);
    return () => this.invokers.delete(key);
  }

  call<TRes = any>(key: string, req: any, opts?: { timeoutMs?: number }): Promise<TRes> {
    const fn = this.invokers.get(key);
    if (!fn) return Promise.reject(new Error(`No service bound for ${key}`));
    return fn(req, opts) as Promise<TRes>;
  }
}

export const serviceBus = new ServiceBus();
export const svcKey = (instanceId: string, attrName: string) => `${instanceId}::${attrName}`;
