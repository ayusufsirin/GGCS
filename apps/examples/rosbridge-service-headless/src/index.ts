import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
  type Procedure,
  type Source,
  type Subscription,
} from "@ggcs/core";
import {
  ROS_PLUGIN_ID,
  createRosDomainPlugin,
  rosMessageTypeId,
  rosServiceTypeId,
  type RosMessage,
  type RosServiceRequest,
  type RosServiceResponse,
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
const smokeTimeoutMs = Number(environment.GGCS_ROSBRIDGE_SERVICE_SMOKE_TIMEOUT_MS ?? "15000");
const messageType = "std_msgs/msg/Float64";
const serviceType = "std_srvs/srv/Trigger";
const readySourceId = "fixture.service.ready";
const triggerProcedureId = "fixture.service.trigger";
const slowProcedureId = "fixture.service.slow-trigger";

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

function waitForReady(source: Source<RosMessage>, timeout: number): Promise<void> {
  const current = source.current();
  if (current.state === "fresh" && current.value.data === 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let subscription: Subscription | undefined;
    const timer = platform.setTimeout(() => {
      subscription?.unsubscribe();
      reject(
        new Error(
          `Timed out waiting for ROS service fixture readiness after ${timeout}ms; current=${JSON.stringify(
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
      if (observation.state !== "fresh" || observation.value.data !== 1) return;
      platform.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve();
    });
  });
}

const registry = createRegistryBuilder()
  .register(
    createRosDomainPlugin({
      messageTypes: [messageType],
      serviceTypes: [serviceType],
    }),
  )
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
        id: triggerProcedureId,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(serviceType),
        config: {
          connection: "robot",
          service: "/ggcs_test/trigger",
          serviceType,
          timeoutMs: 5_000,
        },
      },
      {
        id: slowProcedureId,
        provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
        type: rosServiceTypeId(serviceType),
        config: {
          connection: "robot",
          service: "/ggcs_test/slow_trigger",
          serviceType,
          timeoutMs: 250,
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
const trigger = runtime.resource<Procedure<RosServiceRequest, RosServiceResponse>>(
  triggerProcedureId,
);
const slow = runtime.resource<Procedure<RosServiceRequest, RosServiceResponse>>(
  slowProcedureId,
);

try {
  await waitForConnected(connection, smokeTimeoutMs);
  await waitForReady(ready, smokeTimeoutMs);

  const successInvocation = trigger.invoke({});
  const success = await successInvocation.result();
  if (success.success !== true || success.message !== "ggcs-service-ok") {
    throw new Error(`Unexpected Trigger response: ${JSON.stringify(success)}`);
  }

  const timeoutInvocation = slow.invoke({});
  try {
    await timeoutInvocation.result();
    throw new Error("Slow ROS service unexpectedly completed before GGCS timeout");
  } catch (error) {
    if (timeoutInvocation.current().state !== "timed_out") throw error;
  }

  platform.console?.log(
    JSON.stringify(
      {
        runtime: runtime.state(),
        endpoint,
        connection: connection.current(),
        success: {
          invocation: successInvocation.current(),
          response: success,
        },
        timeout: {
          invocation: timeoutInvocation.current(),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.stop();
}
