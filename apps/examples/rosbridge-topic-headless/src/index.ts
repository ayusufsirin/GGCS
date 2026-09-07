import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  ROS_PLUGIN_ID,
  createRosDomainPlugin,
  rosMessageTypeId,
  type RosMessage,
} from "@ggcs/ros";
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
const timeoutMs = Number(environment.GGCS_ROSBRIDGE_TOPIC_TIMEOUT_MS ?? "15000");
const messageType = "std_msgs/msg/Float64";
const sourceId = "fixture.temperature.raw";

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

function waitForFresh(source: Source<RosMessage>, timeout: number): Promise<RosMessage> {
  const current = source.current();
  if (current.state === "fresh") return Promise.resolve(current.value);
  if (current.state === "error") return Promise.reject(current.error);

  return new Promise<RosMessage>((resolve, reject) => {
    let subscription: Subscription | undefined;
    const timer = platform.setTimeout(() => {
      subscription?.unsubscribe();
      reject(
        new Error(
          `Timed out waiting for ROS topic Source after ${timeout}ms; current=${JSON.stringify(
            source.current(),
          )}`,
        ),
      );
    }, timeout);
    subscription = source.subscribe((observation) => {
      if (observation.state === "error") {
        platform.clearTimeout(timer);
        subscription?.unsubscribe();
        reject(observation.error);
        return;
      }
      if (observation.state !== "fresh") return;
      platform.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(observation.value);
    });
  });
}

const registry = createRegistryBuilder()
  .register(createRosDomainPlugin({ messageTypes: [messageType] }))
  .register(createRosbridgeTransportPlugin());

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
        id: sourceId,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: rosMessageTypeId(messageType),
        config: {
          connection: "robot",
          topic: "/ggcs_test/temperature",
          messageType,
        },
      },
    ],
  },
  registry,
);

const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>("robot");
const source = runtime.resource<Source<RosMessage>>(sourceId);

try {
  await waitForConnected(connection, timeoutMs);
  const message = await waitForFresh(source, timeoutMs);
  const data = message.data;
  if (typeof data !== "number" || !Number.isFinite(data)) {
    throw new Error(`Expected std_msgs/msg/Float64 data number, received ${String(data)}`);
  }

  platform.console?.log(
    JSON.stringify(
      {
        runtime: runtime.state(),
        endpoint,
        connection: connection.current(),
        source: source.current(),
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.stop();
}
