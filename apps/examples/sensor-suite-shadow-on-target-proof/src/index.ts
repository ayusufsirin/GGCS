import {
  type Connection,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  SENSOR_SUITE_RESOURCE_IDS,
  compileSensorSuiteShadowApplication,
} from "@ggcs/example-sensor-suite-shadow-headless/definition";
import {
  LegacyOnTargetObserver,
  type OnTargetSemanticResourceId,
  type OnTargetSemanticValue,
} from "./legacy-reference.js";
import {
  BoundedSkewPairingRecorder,
  type PairingReport,
} from "./pairing.js";

const platform = globalThis as unknown as {
  readonly process: { readonly env: Readonly<Record<string, string | undefined>> };
  readonly console?: { log(...args: unknown[]): void };
};

const endpoint = platform.process.env.GGCS_ROSBRIDGE_URL ?? "ws://host.docker.internal:9090";
const startupTimeoutMs = Number(platform.process.env.GGCS_M03_ON_TARGET_STARTUP_TIMEOUT_MS ?? "30000");
const runTimeoutMs = Number(platform.process.env.GGCS_M03_ON_TARGET_TIMEOUT_MS ?? "1800000");
const minimumDurationMs = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_DURATION_MS ?? "600000");
const minimumHighRateMatches = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_HIGH_RATE_MATCHES ?? "1000");
const minimumLowRateMatches = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_LOW_RATE_MATCHES ?? "20");
const maxSkewMs = Number(platform.process.env.GGCS_M03_ON_TARGET_MAX_SKEW_MS ?? "100");

const specs = [
  { id: SENSOR_SUITE_RESOURCE_IDS.navRollDeg, kind: "number", tolerance: 0.1, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.navPitchDeg, kind: "number", tolerance: 0.1, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.navHeadingDeg, kind: "number", tolerance: 0.1, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.navAltitudeM, kind: "number", tolerance: 0.05, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.navLatitudeDeg, kind: "number", tolerance: 1e-6, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.navLongitudeDeg, kind: "number", tolerance: 1e-6, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.vehicleSpeed, kind: "number", tolerance: 0.05, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.vehicleAcceleration, kind: "number", tolerance: 0.1, highRate: true },
  { id: SENSOR_SUITE_RESOURCE_IDS.arnavSatellites, kind: "number", tolerance: 0, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthSystem, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthRollPitch, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthYaw, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthPositionVelocity, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthMagnetometer, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.healthGnssFixed, kind: "boolean", tolerance: null, highRate: false },
  { id: SENSOR_SUITE_RESOURCE_IDS.rtkFixedLegacy, kind: "boolean", tolerance: null, highRate: false },
] as const satisfies readonly {
  readonly id: OnTargetSemanticResourceId;
  readonly kind: "number" | "boolean";
  readonly tolerance: number | null;
  readonly highRate: boolean;
}[];

const recorders = new Map<OnTargetSemanticResourceId, BoundedSkewPairingRecorder<OnTargetSemanticValue>>(
  specs.map((spec) => [
    spec.id,
    new BoundedSkewPairingRecorder<OnTargetSemanticValue>({
      maxSkewMs,
      tolerance: spec.tolerance,
    }),
  ]),
);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(description: string, predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function reports(finalize = false): Record<OnTargetSemanticResourceId, PairingReport> {
  return Object.fromEntries(
    specs.map((spec) => [spec.id, recorders.get(spec.id)!.report(finalize)]),
  ) as Record<OnTargetSemanticResourceId, PairingReport>;
}

function thresholdsSatisfied(current: Record<OnTargetSemanticResourceId, PairingReport>): boolean {
  return specs.every((spec) =>
    current[spec.id].matched >= (spec.highRate ? minimumHighRateMatches : minimumLowRateMatches),
  );
}

function assertNoSemanticMismatch(current: Record<OnTargetSemanticResourceId, PairingReport>): void {
  for (const spec of specs) {
    const report = current[spec.id];
    if (report.mismatched > 0) {
      throw new Error(`${spec.id} has ${report.mismatched} semantic mismatches; max delta=${String(report.maxAbsoluteDelta)}`);
    }
  }
}

const compiled = compileSensorSuiteShadowApplication({ rosbridgeUrl: endpoint });
const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>(SENSOR_SUITE_RESOURCE_IDS.connection);
const subscriptions: Subscription[] = [];
const currentStates = new Map<OnTargetSemanticResourceId, string>();

for (const spec of specs) {
  const source = runtime.resource<Source<OnTargetSemanticValue>>(spec.id);
  subscriptions.push(source.subscribe((observation) => {
    currentStates.set(spec.id, observation.state);
    if (observation.state === "fresh") {
      recorders.get(spec.id)!.recordGgcs(observation.value, Date.now());
    }
  }));
}

const legacyStates: string[] = [];
const legacy = new LegacyOnTargetObserver({
  url: endpoint,
  onConnectionState(state) { legacyStates.push(state); },
  onSample(resourceId, value, at) { recorders.get(resourceId)!.recordLegacy(value, at); },
});
legacy.start();

try {
  await waitUntil("GGCS production ROSBridge connection", () => connection.current().state === "connected", startupTimeoutMs);
  await waitUntil("legacy-reference ROSBridge connection", () => legacy.isConnected(), startupTimeoutMs);
  await waitUntil(
    "all production semantic resources to become fresh on both observation paths",
    () => specs.every((spec) =>
      currentStates.get(spec.id) === "fresh" && recorders.get(spec.id)!.report().legacySamples > 0,
    ),
    startupTimeoutMs,
  );

  for (const recorder of recorders.values()) recorder.reset();
  const evidenceStartedAt = Date.now();
  const deadline = evidenceStartedAt + runTimeoutMs;

  while (true) {
    await delay(1_000);
    const current = reports();
    assertNoSemanticMismatch(current);
    const elapsedMs = Date.now() - evidenceStartedAt;
    if (elapsedMs >= minimumDurationMs && thresholdsSatisfied(current)) break;
    if (Date.now() >= deadline) {
      throw new Error(
        `On-target evidence timed out before thresholds were met: elapsedMs=${elapsedMs}, reports=${JSON.stringify(current)}`,
      );
    }
  }

  const finalReports = reports(true);
  assertNoSemanticMismatch(finalReports);
  if (!thresholdsSatisfied(finalReports)) {
    throw new Error("On-target evidence lost required matches while finalizing skew queues");
  }

  platform.console?.log(JSON.stringify({
    mode: "m03-on-target-production-parity",
    endpoint,
    evidence: {
      startedAt: evidenceStartedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - evidenceStartedAt,
      requiredMinimumDurationMs: minimumDurationMs,
      requiredHighRateMatches: minimumHighRateMatches,
      requiredLowRateMatches: minimumLowRateMatches,
      maxPairingSkewMs: maxSkewMs,
    },
    runtime: runtime.state(),
    connection: connection.current(),
    legacyConnectionStates: legacyStates,
    resources: finalReports,
    productionInterfacePolicy: {
      arnavMessageType: "ardiclabs_arnav_msgs/msg/Ins",
      fabricatedInterface: false,
    },
    sideEffects: {
      commandsPublished: 0,
      recordingProceduresInvoked: 0,
      parameterWrites: 0,
    },
  }, null, 2));
} finally {
  legacy.stop();
  for (const subscription of subscriptions) subscription.unsubscribe();
  await runtime.stop();
}
