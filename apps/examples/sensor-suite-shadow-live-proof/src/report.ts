import {
  SampleRecorder,
  matchedValues,
  type EvidenceStage,
} from "./telemetry.js";

export interface WindowReport {
  readonly legacyUniqueSamples: number;
  readonly ggcsUniqueSamples: number;
  readonly matchedUniqueValues: number;
  readonly legacyOnlyValues: readonly number[];
  readonly ggcsOnlyValues: readonly number[];
  readonly legacyEdgeOnlyValues: readonly number[];
  readonly ggcsEdgeOnlyValues: readonly number[];
  readonly legacyDuplicateDeliveries: number;
  readonly ggcsDuplicateDeliveries: number;
  readonly maxAbsoluteError: number;
  readonly legacyArrival: { readonly first: number | null; readonly last: number | null };
  readonly ggcsArrival: { readonly first: number | null; readonly last: number | null };
  readonly legacyRateHz: number | null;
  readonly ggcsRateHz: number | null;
}

function difference(left: ReadonlySet<number>, right: ReadonlySet<number>): readonly number[] {
  return [...left].filter((value) => !right.has(value)).sort((a, b) => a - b);
}

function splitCommonRange(
  values: readonly number[],
  matched: readonly number[],
): { readonly inside: readonly number[]; readonly edge: readonly number[] } {
  if (matched.length === 0) return { inside: values, edge: [] };
  const low = matched[0]!;
  const high = matched[matched.length - 1]!;
  return {
    inside: values.filter((value) => value >= low && value <= high),
    edge: values.filter((value) => value < low || value > high),
  };
}

export function buildWindowReport(
  legacy: SampleRecorder,
  ggcs: SampleRecorder,
  stage: EvidenceStage,
): WindowReport {
  const legacyValues = legacy.uniqueValues(stage);
  const ggcsValues = ggcs.uniqueValues(stage);
  const matched = matchedValues(legacy, ggcs, stage);
  const legacyOnly = splitCommonRange(difference(legacyValues, ggcsValues), matched);
  const ggcsOnly = splitCommonRange(difference(ggcsValues, legacyValues), matched);
  return {
    legacyUniqueSamples: legacyValues.size,
    ggcsUniqueSamples: ggcsValues.size,
    matchedUniqueValues: matched.length,
    legacyOnlyValues: legacyOnly.inside,
    ggcsOnlyValues: ggcsOnly.inside,
    legacyEdgeOnlyValues: legacyOnly.edge,
    ggcsEdgeOnlyValues: ggcsOnly.edge,
    legacyDuplicateDeliveries: legacy.duplicateDeliveries(stage),
    ggcsDuplicateDeliveries: ggcs.duplicateDeliveries(stage),
    maxAbsoluteError: matched.length > 0 ? 0 : Number.POSITIVE_INFINITY,
    legacyArrival: legacy.arrivals(stage),
    ggcsArrival: ggcs.arrivals(stage),
    legacyRateHz: legacy.rateHz(stage),
    ggcsRateHz: ggcs.rateHz(stage),
  };
}

export function assertStableWindow(report: WindowReport, minimumMatches = 10): void {
  if (report.matchedUniqueValues < minimumMatches) {
    throw new Error(
      `Stable window has ${report.matchedUniqueValues} matched values; expected at least ${minimumMatches}`,
    );
  }
  if (report.legacyOnlyValues.length > 0 || report.ggcsOnlyValues.length > 0) {
    throw new Error(
      `Stable window semantic mismatch: legacy-only=${JSON.stringify(report.legacyOnlyValues)}, ggcs-only=${JSON.stringify(report.ggcsOnlyValues)}`,
    );
  }
  if (report.ggcsDuplicateDeliveries !== 0) {
    throw new Error(`GGCS stable window has ${report.ggcsDuplicateDeliveries} duplicate deliveries`);
  }
}
