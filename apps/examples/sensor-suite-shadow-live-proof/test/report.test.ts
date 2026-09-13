import { describe, expect, it } from "vitest";
import { assertStableWindow, buildWindowReport } from "../src/report.js";
import { SampleRecorder } from "../src/telemetry.js";

function recorder(values: readonly number[], offsetMs = 0): SampleRecorder {
  const result = new SampleRecorder();
  values.forEach((value, index) => result.record(value, "baseline", 1_000 + offsetMs + index * 200));
  return result;
}

describe("M03 live shadow evidence reporting", () => {
  it("treats subscriber edge loss separately from semantic mismatch", () => {
    const legacy = recorder([1, 2, 3, 4, 5, 6]);
    const ggcs = recorder([2, 3, 4, 5, 6, 7], 10);
    const report = buildWindowReport(legacy, ggcs, "baseline");
    expect(report.matchedUniqueValues).toBe(5);
    expect(report.legacyOnlyValues).toEqual([]);
    expect(report.ggcsOnlyValues).toEqual([]);
    expect(report.legacyEdgeOnlyValues).toEqual([1]);
    expect(report.ggcsEdgeOnlyValues).toEqual([7]);
    expect(() => assertStableWindow(report, 5)).not.toThrow();
  });

  it("detects duplicate GGCS delivery inside a stable window", () => {
    const legacy = recorder([1, 2, 3]);
    const ggcs = recorder([1, 2, 2, 3], 10);
    const report = buildWindowReport(legacy, ggcs, "baseline");
    expect(report.ggcsDuplicateDeliveries).toBe(1);
    expect(() => assertStableWindow(report, 3)).toThrow(/duplicate deliveries/);
  });
});
