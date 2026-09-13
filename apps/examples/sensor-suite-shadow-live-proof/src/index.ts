import {
  type Connection,
  type ConnectionState,
  type Parameter,
  type ParameterProvider,
  type Source,
  type Subscription,
} from "@ggcs/core";
import type { ParameterDescriptor } from "@ggcs/schema";
import {
  LIVE_RESOURCE_IDS,
  compileLiveShadowApplication,
} from "./definition.js";
import { LegacyReferenceObserver } from "./legacy-reference.js";
import { LinkFaultProxyControl } from "./proxy-control.js";
import { assertStableWindow, buildWindowReport, type WindowReport } from "./report.js";
import {
  SampleRecorder,
  matchedValues,
  type EvidenceStage,
} from "./telemetry.js";

const platform = globalThis as unknown as {
  readonly process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    memoryUsage(): { readonly rss: number; readonly heapUsed: number };
  };
  readonly console?: { log(...args: unknown[]): void };
};
const endpoint = platform.process.env.GGCS_M03_SHADOW_URL ?? "ws://localhost:9091";
const timeoutMs = Number(platform.process.env.GGCS_M03_LIVE_TIMEOUT_MS ?? "20000");
const proxyControlHost = platform.process.env.GGCS_M03_PROXY_CONTROL_HOST ?? "m03-link-proxy";
const proxyControlPort = Number(platform.process.env.GGCS_M03_PROXY_CONTROL_PORT ?? "9092");
let stage: EvidenceStage = "baseline";

const resourceIds = [
  LIVE_RESOURCE_IDS.speed,
  LIVE_RESOURCE_IDS.acceleration,
  LIVE_RESOURCE_IDS.satellites,
] as const;
type ResourceId = (typeof resourceIds)[number];
const parameterId = "/ggcs_m03_shadow_fixture:ggcs_shadow_test_parameter";

const legacyRecorders = new Map<ResourceId, SampleRecorder>(
  resourceIds.map((id) => [id, new SampleRecorder()]),
);
const ggcsRecorders = new Map<ResourceId, SampleRecorder>(
  resourceIds.map((id) => [id, new SampleRecorder()]),
);
const observationStates = new Map<ResourceId, string[]>(
  resourceIds.map((id) => [id, []]),
);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  description: string,
  predicate: () => boolean,
  timeout = timeoutMs,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function snapshotMemory(): { readonly rss: number; readonly heapUsed: number } {
  const value = platform.process.memoryUsage();
  return { rss: value.rss, heapUsed: value.heapUsed };
}

function assertNoRateMultiplication(
  baseline: WindowReport,
  recovery: WindowReport,
  resourceId: ResourceId,
): void {
  const before = baseline.ggcsRateHz;
  const after = recovery.ggcsRateHz;
  if (before === null || after === null) return;
  if (after > before * 1.5 + 0.25) {
    throw new Error(
      `${resourceId} GGCS update rate multiplied after reconnect: baseline=${before}, recovery=${after}`,
    );
  }
}

const compiled = compileLiveShadowApplication({ rosbridgeUrl: endpoint });
const runtime = compiled.createRuntime();
await runtime.start();

const connection = runtime.resource<Connection>(LIVE_RESOURCE_IDS.connection);
const connectionStates: ConnectionState[] = [];
const subscriptions: Subscription[] = [
  connection.subscribe((state) => connectionStates.push(state)),
];
const sources = new Map<ResourceId, Source<number>>();
for (const resourceId of resourceIds) {
  const source = runtime.resource<Source<number>>(resourceId);
  sources.set(resourceId, source);
  subscriptions.push(
    source.subscribe((observation) => {
      observationStates.get(resourceId)!.push(observation.state);
      if (observation.state === "fresh") {
        ggcsRecorders.get(resourceId)!.record(observation.value, stage);
      }
    }),
  );
}

const legacyStates: string[] = [];
const legacy = new LegacyReferenceObserver({
  url: endpoint,
  onConnectionState(state) {
    legacyStates.push(state);
  },
  onSample(resourceId, value) {
    legacyRecorders.get(resourceId)!.record(value, stage);
  },
});
legacy.start();
const proxy = new LinkFaultProxyControl(proxyControlHost, proxyControlPort);

let parameterProvider: ParameterProvider | undefined;
let parameter: Parameter<string> | undefined;
let parameterDescriptor: ParameterDescriptor<unknown> | undefined;

async function checkParameterParity(label: string): Promise<{
  readonly label: string;
  readonly legacyValue: string;
  readonly ggcsValue: string;
}> {
  const referenceNodes = await legacy.listNodes(timeoutMs);
  if (!referenceNodes.includes("/ggcs_m03_shadow_fixture")) {
    throw new Error("Legacy reference did not discover /ggcs_m03_shadow_fixture via /rosapi/nodes");
  }
  const referenceValue = await legacy.getParameter(parameterId, timeoutMs);
  parameterProvider ??= runtime.resource<ParameterProvider>(LIVE_RESOURCE_IDS.parameters);
  if (!parameter) {
    const descriptors = await parameterProvider.list({ prefix: "/ggcs_m03_shadow_fixture:" });
    parameterDescriptor = descriptors.find((candidate) => candidate.id === parameterId);
    if (!parameterDescriptor) {
      throw new Error(`GGCS ParameterProvider did not discover ${parameterId}`);
    }
    if ("defaultValue" in parameterDescriptor) {
      throw new Error("GGCS ParameterProvider must not synthesize parameter defaultValue");
    }
    parameter = await parameterProvider.resolve<string>(parameterId);
  }
  const ggcsValue = await parameter.refresh().result();
  if (ggcsValue !== referenceValue) {
    throw new Error(`Parameter value mismatch after ${label}: legacy=${referenceValue}, ggcs=${ggcsValue}`);
  }
  return { label, legacyValue: referenceValue, ggcsValue };
}

function allSourcesState(stateName: string): boolean {
  return resourceIds.every((id) => sources.get(id)!.current().state === stateName);
}

async function waitForMatches(stageName: EvidenceStage, minimum: number): Promise<void> {
  await waitUntil(`${minimum} matched samples per resource in ${stageName}`, () =>
    resourceIds.every(
      (id) =>
        matchedValues(
          legacyRecorders.get(id)!,
          ggcsRecorders.get(id)!,
          stageName,
        ).length >= minimum,
    ),
  );
}

try {
  await waitUntil("GGCS ROSBridge connection", () => connection.current().state === "connected");
  await waitUntil("legacy-reference ROSBridge connection", () => legacy.isConnected());
  await waitForMatches("baseline", 10);
  stage = "recovery-0";

  const baseline = Object.fromEntries(
    resourceIds.map((id) => {
      const report = buildWindowReport(
        legacyRecorders.get(id)!,
        ggcsRecorders.get(id)!,
        "baseline",
      );
      assertStableWindow(report);
      return [id, report];
    }),
  ) as Record<ResourceId, WindowReport>;

  const parameterChecks = [await checkParameterParity("baseline")];
  const memoryBaseline = snapshotMemory();
  const cycles: Array<Readonly<Record<string, unknown>>> = [];

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    stage = `outage-${cycle}`;
    await proxy.cut();
    await waitUntil(`GGCS reconnecting state in cycle ${cycle}`, () =>
      connection.current().state === "reconnecting",
    );
    await waitUntil(`legacy disconnect in cycle ${cycle}`, () => !legacy.isConnected());
    await waitUntil(`all GGCS semantic sources stale in cycle ${cycle}`, () => allSourcesState("stale"));

    const outageConnection = connection.current();
    const outageSources = Object.fromEntries(
      resourceIds.map((id) => [id, sources.get(id)!.current().state]),
    );
    await delay(500);

    stage = `recovery-${cycle}`;
    await proxy.restore();
    await waitUntil(`GGCS reconnect in cycle ${cycle}`, () => connection.current().state === "connected");
    await waitUntil(`legacy reconnect in cycle ${cycle}`, () => legacy.isConnected());
    await waitUntil(`all GGCS semantic sources fresh in cycle ${cycle}`, () => allSourcesState("fresh"));
    await waitForMatches(stage, 3);

    const cycleReports = Object.fromEntries(
      resourceIds.map((id) => {
        const report = buildWindowReport(
          legacyRecorders.get(id)!,
          ggcsRecorders.get(id)!,
          stage,
        );
        assertStableWindow(report, 3);
        return [id, report];
      }),
    );
    const parameterCheck = await checkParameterParity(`reconnect-${cycle}`);
    parameterChecks.push(parameterCheck);
    cycles.push({
      cycle,
      outageConnection,
      outageSources,
      recoveryConnection: connection.current(),
      reports: cycleReports,
      parameter: parameterCheck,
    });
  }

  stage = "recovery";
  await waitForMatches("recovery", 10);
  stage = "recovery-4";

  const recovery = Object.fromEntries(
    resourceIds.map((id) => {
      const report = buildWindowReport(
        legacyRecorders.get(id)!,
        ggcsRecorders.get(id)!,
        "recovery",
      );
      assertStableWindow(report);
      assertNoRateMultiplication(baseline[id], report, id);
      return [id, report];
    }),
  ) as Record<ResourceId, WindowReport>;
  const memoryFinal = snapshotMemory();

  platform.console?.log(
    JSON.stringify(
      {
        mode: "m03-live-shadow-operation-proof",
        endpoint,
        proxy: { controlHost: proxyControlHost, controlPort: proxyControlPort },
        runtime: runtime.state(),
        connection: connection.current(),
        connectionStates,
        legacyConnectionStates: legacyStates,
        observationStates: Object.fromEntries(observationStates),
        baseline,
        recovery,
        prePost: Object.fromEntries(
          resourceIds.map((id) => [
            id,
            {
              ggcsUniqueSampleDelta:
                recovery[id].ggcsUniqueSamples - baseline[id].ggcsUniqueSamples,
              ggcsRateDeltaHz:
                recovery[id].ggcsRateHz !== null && baseline[id].ggcsRateHz !== null
                  ? recovery[id].ggcsRateHz! - baseline[id].ggcsRateHz!
                  : null,
            },
          ]),
        ),
        cycles,
        parameter: {
          id: parameterId,
          discoveryMechanism: {
            legacy: "/rosapi/nodes + /rosapi/get_param",
            ggcs: "/rosapi/nodes + node ListParameters + /rosapi/get_param",
          },
          descriptor: parameterDescriptor,
          checks: parameterChecks,
          writesPerformed: 0,
        },
        memory: {
          baseline: memoryBaseline,
          final: memoryFinal,
          delta: {
            rss: memoryFinal.rss - memoryBaseline.rss,
            heapUsed: memoryFinal.heapUsed - memoryBaseline.heapUsed,
          },
        },
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await proxy.restore();
  } catch {
    // Keep cleanup best-effort if the proxy itself is unavailable.
  }
  legacy.stop();
  for (const subscription of subscriptions) subscription.unsubscribe();
  await runtime.stop();
}
