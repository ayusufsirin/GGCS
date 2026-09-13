import { describe, expect, it } from "vitest";
import { CameraEvidenceRecorder, assertCameraParity } from "../src/camera-evidence.js";

describe("camera transport evidence", () => {
  it("reports arrival rate and compressed payload lengths without decoding pixels", () => {
    const recorder = new CameraEvidenceRecorder();
    recorder.record(100, 1000);
    recorder.record(120, 1100);
    recorder.record(80, 1200);
    expect(recorder.summary()).toEqual({
      samples: 3,
      firstAt: 1000,
      lastAt: 1200,
      rateHz: 10,
      payloadLength: { min: 80, max: 120, average: 100, total: 300 },
    });
  });

  it("accepts similar arrival rates and rejects missing evidence", () => {
    const legacy = new CameraEvidenceRecorder();
    const ggcs = new CameraEvidenceRecorder();
    for (let i = 0; i < 20; i += 1) {
      legacy.record(100 + i, 1000 + i * 100);
      ggcs.record(100 + i, 1002 + i * 100);
    }
    expect(() => assertCameraParity(legacy.summary(), ggcs.summary(), 20)).not.toThrow();
    expect(() => assertCameraParity(legacy.summary(), new CameraEvidenceRecorder().summary(), 20)).toThrow();
  });
});
