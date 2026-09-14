import {
  type Connection,
  type Parameter,
  type ParameterProvider,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  SENSOR_SUITE_ACCELERATION_TOPIC,
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_RESOURCE_IDS,
  SENSOR_SUITE_SATELLITES_TOPIC,
  SENSOR_SUITE_SPEED_TOPIC,
  SENSOR_SUITE_ZED_RGB_TOPIC,
  compileSensorSuiteShadowApplication,
} from "@ggcs/example-sensor-suite-shadow-headless/definition";
import { parseRosParameterAddress, type RosMessage } from "@ggcs/ros";
import {
  LegacyOnTargetObserver,
  type OnTargetSemanticResourceId,
  type OnTargetSemanticValue,
} from "./legacy-reference.js";
import {
  BoundedSkewPairingRecorder,
  type PairingReport,
} from "./pairing.js";
import { CameraEvidenceRecorder, assertCameraParity } from "./camera-evidence.js";
import {
  SubscriptionDiagnostics,
  assertSinglePhysicalSubscriptions,
  createDiagnosticClientFactory,
} from "./subscription-diagnostics.js";

const platform = globalThis as unknown as {
  readonly process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    memoryUsage(): { readonly rss: number; readonly heapUsed: number };
    cpuUsage(previousValue?: { readonly user: number; readonly system: number }): { readonly user: number; readonly system: number };
  };
  readonly console?: { log(...args: unknown[]): void };
};

const endpoint = platform.process.env.GGCS_ROSBRIDGE_URL ?? "ws://m03-contract-ros:9090";
const startupTimeoutMs = Number(platform.process.env.GGCS_M03_ON_TARGET_STARTUP_TIMEOUT_MS ?? "30000");
const runTimeoutMs = Number(platform.process.env.GGCS_M03_ON_TARGET_TIMEOUT_MS ?? "300000");
const minimumDurationMs = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_DURATION_MS ?? "30000");
const minimumHighRateMatches = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_HIGH_RATE_MATCHES ?? "1000");
const minimumLowRateMatches = Number(platform.process.env.GGCS_M03_ON_TARGET_MIN_LOW_RATE_MATCHES ?? "20");
const maxSkewMs = Number(platform.process.env.GGCS_M03_ON_TARGET_MAX_SKEW_MS ?? "100");
const parameterTimeoutMs = Number(platform.process.env.GGCS_M03_ON_TARGET_PARAMETER_TIMEOUT_MS ?? "15000");
const parameterIds = (platform.process.env.GGCS_M03_ON_TARGET_PARAMETER_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const parameterDisposition = (platform.process.env.GGCS_M03_ON_TARGET_PARAMETER_DISPOSITION ?? "").trim();

const cameraMode = (platform.process.env.GGCS_M03_ON_TARGET_CAMERA_MODE ?? "off").trim();
const cameraDisposition = (platform.process.env.GGCS_M03_ON_TARGET_CAMERA_DISPOSITION ?? "").trim();
const cameraMinimumSamples = Number(platform.process.env.GGCS_M03_ON_TARGET_CAMERA_MIN_SAMPLES ?? "20");
const observeCamera = cameraMode === "observe";

if (!observeCamera && cameraDisposition.length === 0) {
  throw new Error(
    "Slice 04 requires explicit camera disposition when camera observation is disabled: set GGCS_M03_ON_TARGET_CAMERA_DISPOSITION",
  );
}
if (parameterIds.length === 0 && parameterDisposition.length === 0) {
  throw new Error(
    "Slice 04 requires explicit parameter evidence: set GGCS_M03_ON_TARGET_PARAMETER_IDS or GGCS_M03_ON_TARGET_PARAMETER_DISPOSITION",
  );
}

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
    new BoundedSkewPairingRecorder<OnTargetSemanticValue>({ maxSkewMs, tolerance: spec.tolerance }),
  ]),
);

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitUntil(description: string, predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function reports(finalize = false): Record<OnTargetSemanticResourceId, PairingReport> {
  return Object.fromEntries(specs.map((spec) => [spec.id, recorders.get(spec.id)!.report(finalize)])) as Record<OnTargetSemanticResourceId, PairingReport>;
}

function thresholdsSatisfied(current: Record<OnTargetSemanticResourceId, PairingReport>): boolean {
  return specs.every((spec) => current[spec.id].matched >= (spec.highRate ? minimumHighRateMatches : minimumLowRateMatches));
}

function assertNoSemanticMismatch(current: Record<OnTargetSemanticResourceId, PairingReport>): void {
  for (const spec of specs) {
    const report = current[spec.id];
    if (report.mismatched > 0) {
      throw new Error(`${spec.id} has ${report.mismatched} semantic mismatches; max delta=${String(report.maxAbsoluteDelta)}`);
    }
  }
}

const cameraLegacy = new CameraEvidenceRecorder();
const cameraGgcs = new CameraEvidenceRecorder();
const subscriptionDiagnostics = new SubscriptionDiagnostics();
const requiredPhysicalSubscriptionTopics = [
  SENSOR_SUITE_ARNAV_TOPIC,
  SENSOR_SUITE_SPEED_TOPIC,
  SENSOR_SUITE_ACCELERATION_TOPIC,
  SENSOR_SUITE_SATELLITES_TOPIC,
  ...(observeCamera ? [SENSOR_SUITE_ZED_RGB_TOPIC] : []),
] as const;
const compiled = compileSensorSuiteShadowApplication({
  rosbridgeUrl: endpoint,
  includeCamera: observeCamera,
  transport: { clientFactory: createDiagnosticClientFactory(subscriptionDiagnostics) },
});
const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>(SENSOR_SUITE_RESOURCE_IDS.connection);
const subscriptions: Subscription[] = [];
const currentStates = new Map<OnTargetSemanticResourceId, string>();

for (const spec of specs) {
  const source = runtime.resource<Source<OnTargetSemanticValue>>(spec.id);
  subscriptions.push(source.subscribe((observation) => {
    currentStates.set(spec.id, observation.state);
    if (observation.state === "fresh") recorders.get(spec.id)!.recordGgcs(observation.value, Date.now());
  }));
}

let cameraGgcsFresh = !observeCamera;
if (observeCamera) {
  const cameraSource = runtime.resource<Source<RosMessage>>(SENSOR_SUITE_RESOURCE_IDS.cameraZedRgbRaw);
  subscriptions.push(cameraSource.subscribe((observation) => {
    if (observation.state !== "fresh") return;
    const data = observation.value.data;
    if (typeof data !== "string") throw new Error("GGCS ZED compressed image data must be a base64 string");
    cameraGgcsFresh = true;
    cameraGgcs.record(data.length, Date.now());
  }));
}

const legacyStates: string[] = [];
const legacy = new LegacyOnTargetObserver({
  url: endpoint,
  onConnectionState(state) { legacyStates.push(state); },
  onSample(resourceId, value, at) { recorders.get(resourceId)!.recordLegacy(value, at); },
  includeCamera: observeCamera,
  onCameraSample(payloadLength, at) { cameraLegacy.record(payloadLength, at); },
});
legacy.start();
const parameterProvider = runtime.resource<ParameterProvider>(SENSOR_SUITE_RESOURCE_IDS.parameters);

async function checkParameters(label: string): Promise<readonly Readonly<Record<string, unknown>>[]> {
  if (parameterIds.length === 0) return [];
  const nodes = await legacy.listNodes(parameterTimeoutMs);
  const results: Readonly<Record<string, unknown>>[] = [];
  for (const id of parameterIds) {
    const address = parseRosParameterAddress(id);
    if (!nodes.includes(address.node)) throw new Error(`Legacy rosapi did not discover parameter node ${address.node}`);
    const descriptors = await parameterProvider.list({ prefix: `${address.node}:` });
    const descriptor = descriptors.find((candidate) => candidate.id === id);
    if (!descriptor) throw new Error(`GGCS ParameterProvider did not discover ${id}`);
    if ("defaultValue" in descriptor) throw new Error(`GGCS ParameterProvider synthesized defaultValue for ${id}`);
    const parameter = await parameterProvider.resolve<string>(id) as Parameter<string>;
    const [legacyValue, ggcsValue] = await Promise.all([
      legacy.getParameter(id, parameterTimeoutMs),
      parameter.refresh().result(),
    ]);
    if (legacyValue !== ggcsValue) throw new Error(`Parameter mismatch for ${id}: legacy=${legacyValue}, ggcs=${ggcsValue}`);
    results.push({ label, id, node: address.node, legacyValue, ggcsValue });
  }
  return results;
}

try {
  await waitUntil("GGCS production-contract ROSBridge connection", () => connection.current().state === "connected", startupTimeoutMs);
  await waitUntil("legacy-reference ROSBridge connection", () => legacy.isConnected(), startupTimeoutMs);
  await waitUntil(
    "all production-contract semantic resources to become fresh on both observation paths",
    () => specs.every((spec) => currentStates.get(spec.id) === "fresh" && recorders.get(spec.id)!.report().legacySamples > 0),
    startupTimeoutMs,
  );
  if (observeCamera) {
    await waitUntil(
      "camera observations on both paths",
      () => cameraGgcsFresh && cameraLegacy.summary().samples > 0,
      startupTimeoutMs,
    );
  }
  const subscriptionBaseline = subscriptionDiagnostics.snapshot();
  assertSinglePhysicalSubscriptions(subscriptionBaseline, requiredPhysicalSubscriptionTopics);
  const parameterBaseline = await checkParameters("baseline");

  for (const recorder of recorders.values()) recorder.reset();
  cameraLegacy.reset();
  cameraGgcs.reset();
  const memoryBaseline = platform.process.memoryUsage();
  const cpuBaseline = platform.process.cpuUsage();
  const evidenceStartedAt = Date.now();
  const deadline = evidenceStartedAt + runTimeoutMs;
  while (true) {
    await delay(1_000);
    const current = reports();
    assertNoSemanticMismatch(current);
    const elapsedMs = Date.now() - evidenceStartedAt;
    if (elapsedMs >= minimumDurationMs && thresholdsSatisfied(current)) break;
    if (Date.now() >= deadline) {
      throw new Error(`Production-contract evidence timed out before thresholds were met: elapsedMs=${elapsedMs}, reports=${JSON.stringify(current)}`);
    }
  }

  const finalReports = reports(true);
  assertNoSemanticMismatch(finalReports);
  if (!thresholdsSatisfied(finalReports)) throw new Error("Production-contract evidence lost required matches while finalizing skew queues");
  const parameterFinal = await checkParameters("final");
  const subscriptionFinal = subscriptionDiagnostics.snapshot();
  assertSinglePhysicalSubscriptions(subscriptionFinal, requiredPhysicalSubscriptionTopics);
  const cameraLegacySummary = cameraLegacy.summary();
  const cameraGgcsSummary = cameraGgcs.summary();
  if (observeCamera) assertCameraParity(cameraLegacySummary, cameraGgcsSummary, cameraMinimumSamples);
  const memoryFinal = platform.process.memoryUsage();
  const cpuDelta = platform.process.cpuUsage(cpuBaseline);
  const durationMs = Date.now() - evidenceStartedAt;
  const memoryDelta = {
    rss: memoryFinal.rss - memoryBaseline.rss,
    heapUsed: memoryFinal.heapUsed - memoryBaseline.heapUsed,
  };
  if (memoryDelta.heapUsed > 256 * 1024 * 1024 || memoryDelta.rss > 512 * 1024 * 1024) {
    throw new Error(`Production-contract shadow memory growth is unexpectedly large: ${JSON.stringify(memoryDelta)}`);
  }
  const cpuCorePercent = durationMs > 0
    ? ((cpuDelta.user + cpuDelta.system) / 1000) / durationMs * 100
    : null;

  platform.console?.log(JSON.stringify({
    mode: "m03-production-contract-integration",
    endpoint,
    evidence: {
      startedAt: evidenceStartedAt,
      finishedAt: Date.now(),
      durationMs,
      requiredMinimumDurationMs: minimumDurationMs,
      requiredHighRateMatches: minimumHighRateMatches,
      requiredLowRateMatches: minimumLowRateMatches,
      maxPairingSkewMs: maxSkewMs,
    },
    runtime: runtime.state(),
    connection: connection.current(),
    legacyConnectionStates: legacyStates,
    resources: finalReports,
    parameters: {
      ids: parameterIds,
      disposition: parameterDisposition || null,
      baseline: parameterBaseline,
      final: parameterFinal,
      writesPerformed: 0,
    },
    subscriptions: {
      evidenceMethod: "integration-only RosbridgeClientFactory wrapper; no public transport metrics API added",
      baseline: subscriptionBaseline,
      final: subscriptionFinal,
    },
    performance: {
      ggcsRuntimeWebSockets: 1,
      independentLegacyReferenceWebSockets: 1,
      proofWebSockets: 2,
      memory: { baseline: memoryBaseline, final: memoryFinal, delta: memoryDelta },
      cpu: { userMicros: cpuDelta.user, systemMicros: cpuDelta.system, approximateSingleCorePercent: cpuCorePercent },
      shadowTopicSubscriptions: subscriptionFinal,
      telemetryEventsObserved: Object.values(finalReports).reduce((sum, report) => sum + report.ggcsSamples, 0),
    },
    camera: observeCamera
      ? {
          mode: "observe",
          topic: SENSOR_SUITE_ZED_RGB_TOPIC,
          minimumSamples: cameraMinimumSamples,
          legacy: cameraLegacySummary,
          ggcs: cameraGgcsSummary,
        }
      : { mode: "disabled", disposition: cameraDisposition },
    productionInterfacePolicy: {
      arnavMessageType: "ardiclabs_arnav_msgs/msg/Ins",
      evidenceLevel: "software-contract-integration",
      testFixtureInterface: "schema-compatible test-only ROS 2 interface matching the ArNav fields consumed by GGCS",
      hardwareQualification: false,
      vendorDriverQualification: false,
    },
    sideEffects: { commandsPublished: 0, recordingProceduresInvoked: 0, parameterWrites: 0 },
  }, null, 2));
} finally {
  legacy.stop();
  for (const subscription of subscriptions) subscription.unsubscribe();
  await runtime.stop();
}
