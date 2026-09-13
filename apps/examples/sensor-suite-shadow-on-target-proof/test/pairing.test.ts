import { describe, expect, it } from "vitest";
import { BoundedSkewPairingRecorder } from "../src/pairing.js";

describe("bounded-skew on-target pairing", () => {
  it("pairs independent arrivals without relying on callback index", () => {
    const recorder = new BoundedSkewPairingRecorder<number>({ maxSkewMs: 20, tolerance: 0.1 });
    recorder.recordLegacy(10, 100);
    recorder.recordGgcs(10.05, 107);
    recorder.recordGgcs(20.02, 205);
    recorder.recordLegacy(20, 200);
    const report = recorder.report();
    expect(report).toMatchObject({
      matched: 2,
      mismatched: 0,
      legacySkewMisses: 0,
      ggcsSkewMisses: 0,
    });
    expect(report.maxAbsoluteDelta).toBeCloseTo(0.05, 12);
  });

  it("records skew misses separately from semantic mismatches", () => {
    const recorder = new BoundedSkewPairingRecorder<number>({ maxSkewMs: 10, tolerance: 0.01 });
    recorder.recordLegacy(1, 100);
    recorder.recordGgcs(2, 140);
    recorder.recordLegacy(2.5, 141);
    const report = recorder.report(true);
    expect(report.legacySkewMisses).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.mismatched).toBe(1);
  });

  it("compares boolean status semantics exactly", () => {
    const recorder = new BoundedSkewPairingRecorder<boolean>({ maxSkewMs: 10, tolerance: null });
    recorder.recordLegacy(true, 100);
    recorder.recordGgcs(false, 101);
    expect(recorder.report()).toMatchObject({ matched: 1, mismatched: 1, maxAbsoluteDelta: null });
  });
});
