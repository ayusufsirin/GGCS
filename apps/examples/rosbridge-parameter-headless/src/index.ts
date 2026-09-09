import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
  type Invocation,
  type ParameterProvider,
  type Subscription,
} from "@ggcs/core";
import { ROS_PLUGIN_ID, createRosDomainPlugin } from "@ggcs/ros";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import {
  ROSBRIDGE_PLUGIN_ID,
  ROSBRIDGE_PROVIDER_IDS,
  createRosbridgeTransportPlugin,
} from "@ggcs/transport-rosbridge";

type PlatformGlobals = {
  readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  readonly console?: { log(...args: unknown[]): void };
};

const platform = globalThis as unknown as PlatformGlobals;
const environment = platform.process?.env ?? {};
const endpoint = environment.GGCS_ROSBRIDGE_URL ?? "ws://localhost:9090";
const smokeTimeout = Number(environment.GGCS_ROSBRIDGE_PARAMETER_SMOKE_TIMEOUT_MS ?? "15000");
const parameterId = "/ggcs_m02_topic_fixture:ggcs_test_parameter";

function waitForConnected(connection: Connection, timeoutMs: number): Promise<void> {
  if (connection.current().state === "connected") return Promise.resolve();
  return new Promise((resolve, reject) => {
    let subscription: Subscription | undefined;
    const timer = platform.setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error(`Timed out waiting for ROSBridge connection after ${timeoutMs}ms`));
    }, timeoutMs);
    subscription = connection.subscribe((state) => {
      if (state.state !== "connected") return;
      platform.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve();
    });
  });
}

async function invocationResult<T>(invocation: Invocation<T>): Promise<T> {
  return invocation.result();
}

const compiled = compileApplication(
  {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [ROS_PLUGIN_ID, ROSBRIDGE_PLUGIN_ID],
    resources: [
      {
        id: "robot",
        provider: ROSBRIDGE_PROVIDER_IDS.connection,
        type: CORE_TYPE_IDS.object,
        config: {
          url: endpoint,
          reconnect: {
            enabled: true,
            initialDelayMs: 250,
            maxDelayMs: 2_000,
            multiplier: 2,
          },
        },
      },
      {
        id: "fixture.parameters",
        provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
        type: CORE_TYPE_IDS.object,
        config: { connection: "robot", timeoutMs: 5_000 },
      },
    ],
  },
  createRegistryBuilder()
    .register(createRosDomainPlugin())
    .register(createRosbridgeTransportPlugin()),
);

const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>("robot");
const provider = runtime.resource<ParameterProvider>("fixture.parameters");

try {
  await waitForConnected(connection, smokeTimeout);
  const descriptors = await provider.list({ prefix: "/ggcs_m02_topic_fixture:" });
  const descriptor = descriptors.find((candidate) => candidate.id === parameterId);
  if (!descriptor) throw new Error(`Did not discover ${parameterId}`);
  if ("defaultValue" in descriptor) {
    throw new Error("ROSBridge ParameterProvider must not synthesize defaultValue");
  }

  const parameter = await provider.resolve<string>(parameterId);
  if (parameter.value.current().state !== "unavailable") {
    throw new Error("Resolved parameter must start unavailable before refresh");
  }
  const before = await invocationResult(parameter.refresh());
  const next = before === "13.75" ? "12.5" : "13.75";
  await invocationResult(parameter.write(next));
  const after = await invocationResult(parameter.refresh());
  if (after !== next) {
    throw new Error(`Parameter write did not persist: expected ${next}, got ${after}`);
  }

  platform.console?.log(
    JSON.stringify(
      {
        runtime: runtime.state(),
        endpoint,
        connection: connection.current(),
        discovery: {
          count: descriptors.length,
          parameter: descriptor,
        },
        read: {
          before,
          source: parameter.value.current(),
        },
        write: {
          sent: next,
          refreshed: after,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.stop();
}
