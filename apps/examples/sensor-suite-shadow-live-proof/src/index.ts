import {
  type Connection,
  type ParameterProvider,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  LIVE_RESOURCE_IDS,
  compileLiveShadowApplication,
} from "./definition.js";
import { LegacyReferenceObserver } from "./legacy-reference.js";
import { buildWindowReport, assertStableWindow } from "./report.js";
import {
  SampleRecorder,
  matchedValues,
  type EvidenceStage,
} from "./telemetry.js";

const platform = globalThis as unknown as {
  readonly process: { readonly env: Readonly<Record<string, string | undefined>> };
  readonly console?: { log(...args: unknown[]): void };
};
const endpoint = platform.process.env.GGCS_M03_SHADOW_URL ?? "ws://localhost:9091";
const timeoutMs = Number(platform.process.env.GGCS_M03_LIVE_TIMEOUT_MS ?? "15000");
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

const compiled = compileLiveShadowApplication({ rosbridgeUrl: endpoint });
const runtime = compiled.createRuntime();
await runtime.start();

const connection = runtime.resource<Connection>(LIVE_RESOURCE_IDS.connection);
const subscriptions: Subscription[] = [];
for (const resourceId of resourceIds) {
  const source = runtime.resource<Source<number>>(resourceId);
  subscriptions.push(
    source.subscribe((observation) => {
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

try {
  await waitUntil("GGCS ROSBridge connection", () => connection.current().state === "connected");
  await waitUntil("legacy-reference ROSBridge connection", () => legacy.isConnected());
  await waitUntil("10 matched samples per live resource", () =>
    resourceIds.every(
      (id) => matchedValues(legacyRecorders.get(id)!, ggcsRecorders.get(id)!, stage).length >= 10,
    ),
  );

  const resources = Object.fromEntries(
    resourceIds.map((id) => {
      const report = buildWindowReport(
        legacyRecorders.get(id)!,
        ggcsRecorders.get(id)!,
        stage,
      );
      assertStableWindow(report);
      return [id, report];
    }),
  );

  const referenceNodes = await legacy.listNodes(timeoutMs);
  if (!referenceNodes.includes("/ggcs_m03_shadow_fixture")) {
    throw new Error("Legacy reference did not discover /ggcs_m03_shadow_fixture via /rosapi/nodes");
  }
  const referenceParameterValue = await legacy.getParameter(parameterId, timeoutMs);
  const parameterProvider = runtime.resource<ParameterProvider>(LIVE_RESOURCE_IDS.parameters);
  const descriptors = await parameterProvider.list({ prefix: "/ggcs_m03_shadow_fixture:" });
  const descriptor = descriptors.find((candidate) => candidate.id === parameterId);
  if (!descriptor) throw new Error(`GGCS ParameterProvider did not discover ${parameterId}`);
  if ("defaultValue" in descriptor) {
    throw new Error("GGCS ParameterProvider must not synthesize parameter defaultValue");
  }
  const parameter = await parameterProvider.resolve<string>(parameterId);
  const ggcsParameterValue = await parameter.refresh().result();
  if (ggcsParameterValue !== referenceParameterValue) {
    throw new Error(
      `Parameter value mismatch: legacy=${referenceParameterValue}, ggcs=${ggcsParameterValue}`,
    );
  }

  platform.console?.log(
    JSON.stringify(
      {
        mode: "m03-live-shadow-baseline",
        endpoint,
        runtime: runtime.state(),
        connection: connection.current(),
        legacyConnectionStates: legacyStates,
        resources,
        parameter: {
          id: parameterId,
          discoveryMechanism: { legacy: "/rosapi/nodes + /rosapi/get_param", ggcs: "/rosapi/nodes + node ListParameters + /rosapi/get_param" },
          legacyValue: referenceParameterValue,
          ggcsValue: ggcsParameterValue,
          descriptor,
        },
      },
      null,
      2,
    ),
  );
} finally {
  legacy.stop();
  for (const subscription of subscriptions) subscription.unsubscribe();
  await runtime.stop();
}
