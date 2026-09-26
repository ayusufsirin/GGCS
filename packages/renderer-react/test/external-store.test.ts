import { describe, expect, it } from "vitest";
import { createCachedExternalStore } from "../src/external-store.js";

describe("cached external store adapter", () => {
  it("keeps getSnapshot referentially stable even when current() allocates", () => {
    let value = 4.25;
    const store = createCachedExternalStore({
      current: () => ({ state: "fresh" as const, value, updatedAt: 1 }),
      subscribe: () => () => undefined,
    });

    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications += 1; });
    const afterSubscribe = store.getSnapshot();
    expect(afterSubscribe).not.toBe(first);
    expect(store.getSnapshot()).toBe(afterSubscribe);
    expect(notifications).toBe(1);

    value = 5;
    expect(store.getSnapshot()).toBe(afterSubscribe);
    unsubscribe();
  });

  it("publishes subscription snapshots and keeps them stable until the next delivery", () => {
    let listener: ((snapshot: { value: number }) => void) | undefined;
    const initial = { value: 1 };
    const store = createCachedExternalStore({
      current: () => initial,
      subscribe: (next) => {
        listener = next;
        return () => { listener = undefined; };
      },
    });

    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications += 1; });
    expect(notifications).toBe(0);

    const next = { value: 2 };
    listener?.(next);
    expect(notifications).toBe(1);
    expect(store.getSnapshot()).toBe(next);
    expect(store.getSnapshot()).toBe(next);

    listener?.(next);
    expect(notifications).toBe(1);
    unsubscribe();
  });
});
