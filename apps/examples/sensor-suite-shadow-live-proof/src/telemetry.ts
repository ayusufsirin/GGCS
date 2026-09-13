export type EvidenceStage = "baseline" | "recovery" | `outage-${number}` | `recovery-${number}`;

export interface TimedSample {
  readonly value: number;
  readonly at: number;
  readonly stage: EvidenceStage;
}

export class SampleRecorder {
  private readonly samples: TimedSample[] = [];

  record(value: number, stage: EvidenceStage, at = Date.now()): void {
    if (!Number.isFinite(value)) throw new Error(`Sample must be finite, got ${String(value)}`);
    this.samples.push({ value, stage, at });
  }

  forStage(stage: EvidenceStage): readonly TimedSample[] {
    return this.samples.filter((sample) => sample.stage === stage);
  }

  uniqueValues(stage: EvidenceStage): ReadonlySet<number> {
    return new Set(this.forStage(stage).map((sample) => sample.value));
  }

  duplicateDeliveries(stage: EvidenceStage): number {
    const counts = new Map<number, number>();
    for (const sample of this.forStage(stage)) {
      counts.set(sample.value, (counts.get(sample.value) ?? 0) + 1);
    }
    let duplicates = 0;
    for (const count of counts.values()) duplicates += Math.max(0, count - 1);
    return duplicates;
  }

  rateHz(stage: EvidenceStage): number | null {
    const samples = this.forStage(stage);
    if (samples.length < 2) return null;
    const first = samples[0]!.at;
    const last = samples[samples.length - 1]!.at;
    const seconds = (last - first) / 1000;
    if (seconds <= 0) return null;
    return (samples.length - 1) / seconds;
  }

  arrivals(stage: EvidenceStage): { readonly first: number | null; readonly last: number | null } {
    const samples = this.forStage(stage);
    return {
      first: samples[0]?.at ?? null,
      last: samples[samples.length - 1]?.at ?? null,
    };
  }
}

export function matchedValues(
  left: SampleRecorder,
  right: SampleRecorder,
  stage: EvidenceStage,
): readonly number[] {
  const leftValues = left.uniqueValues(stage);
  return [...right.uniqueValues(stage)].filter((value) => leftValues.has(value)).sort((a, b) => a - b);
}
