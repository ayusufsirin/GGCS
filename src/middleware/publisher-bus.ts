// src/middleware/publisher-bus.ts
export type PublishFn = (msg: any) => void;

function key(instanceId: string, attrName: string) {
  return `${instanceId}::${attrName}`;
}

class PublisherBus {
  private map = new Map<string, PublishFn>();

  register(instanceId: string, attrName: string, fn: PublishFn) {
    const k = key(instanceId, attrName);
    this.map.set(k, fn);
    return () => this.map.delete(k);
  }

  get(instanceId: string, attrName: string): PublishFn | undefined {
    return this.map.get(key(instanceId, attrName));
  }
}

export const publisherBus = new PublisherBus();

export function pubKey(instanceId: string, attrName: string) {
  return key(instanceId, attrName);
}
