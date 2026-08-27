export interface Subscription {
  readonly closed: boolean;
  unsubscribe(): void;
}

export function createSubscription(onClose: () => void): Subscription {
  let closed = false;
  return {
    get closed(): boolean {
      return closed;
    },
    unsubscribe(): void {
      if (closed) return;
      closed = true;
      onClose();
    },
  };
}
