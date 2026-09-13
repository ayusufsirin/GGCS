export type EvidenceValue = number | boolean;

export interface TimedEvidenceValue<T extends EvidenceValue = EvidenceValue> {
  readonly value: T;
  readonly at: number;
}

export interface PairingReport {
  readonly legacySamples: number;
  readonly ggcsSamples: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly legacySkewMisses: number;
  readonly ggcsSkewMisses: number;
  readonly maxAbsoluteDelta: number | null;
  readonly legacyRateHz: number | null;
  readonly ggcsRateHz: number | null;
  readonly legacyArrival: { readonly first: number | null; readonly last: number | null };
  readonly ggcsArrival: { readonly first: number | null; readonly last: number | null };
}

interface ArrivalSummary {
  count: number;
  first: number | null;
  last: number | null;
}

function rate(summary: ArrivalSummary): number | null {
  if (summary.count < 2 || summary.first === null || summary.last === null) return null;
  const elapsedSeconds = (summary.last - summary.first) / 1000;
  if (elapsedSeconds <= 0) return null;
  return (summary.count - 1) / elapsedSeconds;
}

export class BoundedSkewPairingRecorder<T extends EvidenceValue> {
  private legacyQueue: TimedEvidenceValue<T>[] = [];
  private ggcsQueue: TimedEvidenceValue<T>[] = [];
  private legacy: ArrivalSummary = { count: 0, first: null, last: null };
  private ggcs: ArrivalSummary = { count: 0, first: null, last: null };
  private matched = 0;
  private mismatched = 0;
  private legacySkewMisses = 0;
  private ggcsSkewMisses = 0;
  private maxAbsoluteDelta: number | null = null;

  constructor(
    private readonly options: {
      readonly maxSkewMs: number;
      readonly tolerance: number | null;
    },
  ) {
    if (!Number.isFinite(options.maxSkewMs) || options.maxSkewMs <= 0) {
      throw new Error("maxSkewMs must be a positive finite number");
    }
    if (options.tolerance !== null && (!Number.isFinite(options.tolerance) || options.tolerance < 0)) {
      throw new Error("tolerance must be a non-negative finite number or null");
    }
  }

  reset(): void {
    this.legacyQueue = [];
    this.ggcsQueue = [];
    this.legacy = { count: 0, first: null, last: null };
    this.ggcs = { count: 0, first: null, last: null };
    this.matched = 0;
    this.mismatched = 0;
    this.legacySkewMisses = 0;
    this.ggcsSkewMisses = 0;
    this.maxAbsoluteDelta = null;
  }

  recordLegacy(value: T, at = Date.now()): void {
    this.recordArrival(this.legacy, at);
    this.legacyQueue.push({ value, at });
    this.drain();
  }

  recordGgcs(value: T, at = Date.now()): void {
    this.recordArrival(this.ggcs, at);
    this.ggcsQueue.push({ value, at });
    this.drain();
  }

  report(finalize = false): PairingReport {
    if (finalize) {
      this.drain();
      this.legacySkewMisses += this.legacyQueue.length;
      this.ggcsSkewMisses += this.ggcsQueue.length;
      this.legacyQueue = [];
      this.ggcsQueue = [];
    }
    return {
      legacySamples: this.legacy.count,
      ggcsSamples: this.ggcs.count,
      matched: this.matched,
      mismatched: this.mismatched,
      legacySkewMisses: this.legacySkewMisses,
      ggcsSkewMisses: this.ggcsSkewMisses,
      maxAbsoluteDelta: this.maxAbsoluteDelta,
      legacyRateHz: rate(this.legacy),
      ggcsRateHz: rate(this.ggcs),
      legacyArrival: { first: this.legacy.first, last: this.legacy.last },
      ggcsArrival: { first: this.ggcs.first, last: this.ggcs.last },
    };
  }

  private recordArrival(summary: ArrivalSummary, at: number): void {
    summary.count += 1;
    summary.first ??= at;
    summary.last = at;
  }

  private drain(): void {
    while (this.legacyQueue.length > 0 && this.ggcsQueue.length > 0) {
      const legacy = this.legacyQueue[0]!;
      const ggcs = this.ggcsQueue[0]!;
      const deltaMs = legacy.at - ggcs.at;
      if (Math.abs(deltaMs) <= this.options.maxSkewMs) {
        this.legacyQueue.shift();
        this.ggcsQueue.shift();
        this.matched += 1;
        this.compare(legacy.value, ggcs.value);
        continue;
      }
      if (deltaMs < 0) {
        this.legacyQueue.shift();
        this.legacySkewMisses += 1;
      } else {
        this.ggcsQueue.shift();
        this.ggcsSkewMisses += 1;
      }
    }
  }

  private compare(legacy: T, ggcs: T): void {
    if (typeof legacy === "number" && typeof ggcs === "number") {
      const delta = Math.abs(legacy - ggcs);
      this.maxAbsoluteDelta = Math.max(this.maxAbsoluteDelta ?? 0, delta);
      if (this.options.tolerance === null || delta > this.options.tolerance) this.mismatched += 1;
      return;
    }
    if (legacy !== ggcs) this.mismatched += 1;
  }
}
