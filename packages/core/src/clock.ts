export interface ScheduledTask {
  cancel(): void;
}

export interface RuntimeClock {
  monotonicNow(): number;
  wallNow(): number;
  schedule(delayMs: number, callback: () => void): ScheduledTask;
}

type TimerHandle = unknown;
type PlatformGlobals = {
  readonly performance?: { now(): number };
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

function platform(): PlatformGlobals {
  return globalThis as unknown as PlatformGlobals;
}

export class SystemClock implements RuntimeClock {
  private readonly monotonicOrigin = Date.now();

  monotonicNow(): number {
    const performance = platform().performance;
    return performance?.now() ?? Date.now() - this.monotonicOrigin;
  }

  wallNow(): number {
    return Date.now();
  }

  schedule(delayMs: number, callback: () => void): ScheduledTask {
    const globals = platform();
    const handle = globals.setTimeout(callback, Math.max(0, delayMs));
    let active = true;
    return {
      cancel(): void {
        if (!active) return;
        active = false;
        globals.clearTimeout(handle);
      },
    };
  }
}
