import type { RuntimeClock, ScheduledTask } from "@ggcs/core";

interface PendingTask {
  readonly id: number;
  readonly due: number;
  readonly callback: () => void;
  cancelled: boolean;
}

export class FakeClock implements RuntimeClock {
  private monotonic = 0;
  private wall: number;
  private sequence = 0;
  private readonly tasks: PendingTask[] = [];

  constructor(wallStart = 1_700_000_000_000) {
    this.wall = wallStart;
  }

  monotonicNow(): number {
    return this.monotonic;
  }

  wallNow(): number {
    return this.wall;
  }

  schedule(delayMs: number, callback: () => void): ScheduledTask {
    const task: PendingTask = {
      id: ++this.sequence,
      due: this.monotonic + Math.max(0, delayMs),
      callback,
      cancelled: false,
    };
    this.tasks.push(task);
    return {
      cancel(): void {
        task.cancelled = true;
      },
    };
  }

  advanceBy(ms: number): void {
    if (ms < 0 || !Number.isFinite(ms)) throw new Error("FakeClock cannot move backwards");
    const target = this.monotonic + ms;
    while (true) {
      const next = this.tasks
        .filter((task) => !task.cancelled && task.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      const delta = next.due - this.monotonic;
      this.monotonic = next.due;
      this.wall += delta;
      next.cancelled = true;
      next.callback();
    }
    const remaining = target - this.monotonic;
    this.monotonic = target;
    this.wall += remaining;
  }

  setWallTime(epochMs: number): void {
    this.wall = epochMs;
  }
}
