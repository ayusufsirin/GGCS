export interface CameraEvidenceSummary {
  readonly samples: number;
  readonly firstAt: number | null;
  readonly lastAt: number | null;
  readonly rateHz: number | null;
  readonly payloadLength: {
    readonly min: number | null;
    readonly max: number | null;
    readonly average: number | null;
    readonly total: number;
  };
}

export class CameraEvidenceRecorder {
  private samples = 0;
  private firstAt: number | null = null;
  private lastAt: number | null = null;
  private minLength: number | null = null;
  private maxLength: number | null = null;
  private totalLength = 0;

  reset(): void {
    this.samples = 0;
    this.firstAt = null;
    this.lastAt = null;
    this.minLength = null;
    this.maxLength = null;
    this.totalLength = 0;
  }

  record(payloadLength: number, at = Date.now()): void {
    if (!Number.isInteger(payloadLength) || payloadLength < 0) {
      throw new Error(`Camera payload length must be a non-negative integer, got ${payloadLength}`);
    }
    this.samples += 1;
    this.firstAt ??= at;
    this.lastAt = at;
    this.minLength = Math.min(this.minLength ?? payloadLength, payloadLength);
    this.maxLength = Math.max(this.maxLength ?? payloadLength, payloadLength);
    this.totalLength += payloadLength;
  }

  summary(): CameraEvidenceSummary {
    const elapsedSeconds = this.firstAt !== null && this.lastAt !== null
      ? (this.lastAt - this.firstAt) / 1000
      : 0;
    return {
      samples: this.samples,
      firstAt: this.firstAt,
      lastAt: this.lastAt,
      rateHz: this.samples >= 2 && elapsedSeconds > 0 ? (this.samples - 1) / elapsedSeconds : null,
      payloadLength: {
        min: this.minLength,
        max: this.maxLength,
        average: this.samples > 0 ? this.totalLength / this.samples : null,
        total: this.totalLength,
      },
    };
  }
}

export function assertCameraParity(
  legacy: CameraEvidenceSummary,
  ggcs: CameraEvidenceSummary,
  minimumSamples: number,
): void {
  if (legacy.samples < minimumSamples || ggcs.samples < minimumSamples) {
    throw new Error(`Camera evidence requires ${minimumSamples} samples per side; legacy=${legacy.samples}, ggcs=${ggcs.samples}`);
  }
  if (legacy.rateHz !== null && ggcs.rateHz !== null) {
    const denominator = Math.max(legacy.rateHz, ggcs.rateHz, 0.001);
    const relativeDifference = Math.abs(legacy.rateHz - ggcs.rateHz) / denominator;
    if (relativeDifference > 0.25) {
      throw new Error(`Camera arrival-rate difference is too large: legacy=${legacy.rateHz}, ggcs=${ggcs.rateHz}`);
    }
  }
}
