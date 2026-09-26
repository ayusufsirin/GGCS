export interface CachedExternalStore<T> {
  getSnapshot(): T;
  subscribe(notify: () => void): () => void;
}

/**
 * Adapts GGCS current()/subscribe() resources to React's external-store identity contract.
 *
 * React requires getSnapshot() to return the same object until the store actually changes.
 * GGCS resources expose semantic snapshots but do not require current() implementations to
 * preserve object identity, so cache the latest delivered snapshot behind the adapter.
 */
export function createCachedExternalStore<T>(options: {
  readonly current: () => T;
  readonly subscribe: (listener: (snapshot: T) => void) => () => void;
}): CachedExternalStore<T> {
  let snapshot = options.current();

  return {
    getSnapshot(): T {
      return snapshot;
    },
    subscribe(notify: () => void): () => void {
      const unsubscribe = options.subscribe((next) => {
        if (Object.is(snapshot, next)) return;
        snapshot = next;
        notify();
      });

      // Close the current()/subscribe() race for providers that do not replay their
      // current value during subscribe(). This read occurs only when the subscription
      // is established, never from React's getSnapshot() render path.
      const latest = options.current();
      if (!Object.is(snapshot, latest)) {
        snapshot = latest;
        notify();
      }

      return unsubscribe;
    },
  };
}
