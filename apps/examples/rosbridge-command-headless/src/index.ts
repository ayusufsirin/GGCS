import {
  compileApplication,
  createRegistryBuilder,
  type Command,
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
const timeoutMs = Number(environment.GGCS_ROSBRIDGE_COMMAND_TIMEOUT_MS ?? "15000");
const messageType = "std_msgs/msg/Float64";
const readySourceId = "fixture.command.ready";
const observedSourceId = "fixture.command.observed";
const commandId = "fixture.command.raw";
const commandValue = 42;

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

function waitForMessage(
  source: Source<RosMessage>,
  timeout: number,
  predicate: (message: RosMessage) => boolean,
  description: string,
): Promise<RosMessage> {
  const current = source.current();
  if (current.state === "error") return Promise.reject(current.error);
  if (current.state === "fresh" && predicate(current.value)) {
    return Promise.resolve(current.value);
  }

  return new Promise<RosMessage>((resolve, reject) => {
    let subscription: Subscription | undefined;
    const timer = platform.setTimeout(() => {
      subscription?.unsubscribe();
      reject(
        new Error(
          `Timed out waiting for ${description} after ${timeout}ms; current=${JSON.stringify(
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
      if (observation.state !== "fresh" || !predicate(observation.value)) return;
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
        id: readySourceId,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: rosMessageTypeId(messageType),
        config: {
          connection: "robot",
          topic: "/ggcs_test/command_ready",
          messageType,
        },
      },
      {
        id: observedSourceId,
        provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
        type: rosMessageTypeId(messageType),
        config: {
          connection: "robot",
          topic: "/ggcs_test/command_observed",
          messageType,
        },
      },
      {
        id: commandId,
        provider: ROSBRIDGE_PROVIDER_IDS.topicCommand,
        type: rosMessageTypeId(messageType),
        config: {
          connection: "robot",
          topic: "/ggcs_test/command",
          messageType,
          publish: {
            queueSize: 1,
            latch: false,
          },
        },
      },
    ],
  },
  registry,
);

const runtime = compiled.createRuntime();
await runtime.start();
const connection = runtime.resource<Connection>("robot");
const ready = runtime.resource<Source<RosMessage>>(readySourceId);
const observed = runtime.resource<Source<RosMessage>>(observedSourceId);
const command = runtime.resource<Command<RosMessage>>(commandId);

try {
  await waitForConnected(connection, timeoutMs);
  await waitForMessage(
    ready,
    timeoutMs,
    (message) => message.data === 1,
    "ROS command fixture readiness",
  );

  const receipt = await command.send({ data: commandValue });
  const echo = await waitForMessage(
    observed,
    timeoutMs,
    (message) => message.data === commandValue,
    `ROS fixture echo data=${commandValue}`,
  );

  platform.console?.log(
    JSON.stringify(
      {
        runtime: runtime.state(),
        endpoint,
        connection: connection.current(),
        command: {
          id: commandId,
          sent: { data: commandValue },
          receipt,
        },
        observed: {
          source: observed.current(),
          value: echo,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.stop();
}
