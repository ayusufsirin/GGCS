import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
  type Subscription,
} from "@ggcs/core";
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
const timeoutMs = Number(environment.GGCS_ROSBRIDGE_CONNECT_TIMEOUT_MS ?? "10000");

function waitForConnected(connection: Connection, timeout: number): Promise<void> {
  if (connection.current().state === "connected") return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let subscription: Subscription | undefined;
    const timer = platform.setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error(`Timed out waiting for ROSBridge connection after ${timeout}ms`));
    }, timeout);
    subscription = connection.subscribe((state) => {
      if (state.state !== "connected") return;
      platform.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve();
    });
  });
}

const plugin = createRosbridgeTransportPlugin();
const compiled = compileApplication(
  {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [ROSBRIDGE_PLUGIN_ID],
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
    ],
  },
  createRegistryBuilder().register(plugin),
);

const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>("robot");
const states: string[] = [];
const subscription = connection.subscribe((state) => states.push(state.state));

try {
  await waitForConnected(connection, timeoutMs);
  platform.console?.log(
    JSON.stringify(
      {
        runtime: runtime.state(),
        endpoint,
        connection: connection.current(),
        states,
      },
      null,
      2,
    ),
  );
} finally {
  subscription.unsubscribe();
  await runtime.stop();
}
