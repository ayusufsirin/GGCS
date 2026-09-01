import { describe, expect, it } from "vitest";
import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
  type Source,
} from "@ggcs/core";
import {
  ROS_PLUGIN_ID,
  createRosDomainPlugin,
  rosMessageTypeId,
  type RosMessage,
} from "@ggcs/ros";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import { FakeClock } from "@ggcs/testing";
import {
  ROSBRIDGE_PLUGIN_ID,
  ROSBRIDGE_PROVIDER_IDS,
  createRosbridgeTransportPlugin,
  type RosbridgeClient,
  type RosbridgeClientEvent,
  type RosbridgeClientFactory,
  type RosbridgeClientListener,
  type RosbridgeTopic,
  type RosbridgeTopicListener,
  type RosbridgeTopicOptions,
} from "../src/index.js";

const MESSAGE_TYPE = "std_msgs/msg/Float64";
const MESSAGE_TYPE_ID = rosMessageTypeId(MESSAGE_TYPE);

class FakeRosbridgeTopic implements RosbridgeTopic {
  readonly listeners = new Set<RosbridgeTopicListener>();
  subscribeCalls = 0;
  unsubscribeCalls = 0;

  constructor(readonly options: RosbridgeTopicOptions) {}

  subscribe(listener: RosbridgeTopicListener): void {
    this.subscribeCalls += 1;
    this.listeners.add(listener);
  }

  unsubscribe(listener: RosbridgeTopicListener): void {
    this.unsubscribeCalls += 1;
    this.listeners.delete(listener);
  }

  emit(message: unknown): void {
    for (const listener of [...this.listeners]) listener(message);
  }
}

class FakeRosbridgeClient implements RosbridgeClient {
  isConnected = false;
  readonly connectCalls: string[] = [];
  readonly topics: FakeRosbridgeTopic[] = [];
  closeCalls = 0;
  topicCreationError: unknown | undefined;
  private readonly listeners = new Map<RosbridgeClientEvent, Set<RosbridgeClientListener>>();

  on(event: RosbridgeClientEvent, listener: RosbridgeClientListener): void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
  }

  connect(url: string): void {
    this.connectCalls.push(url);
  }

  close(): void {
    this.closeCalls += 1;
    this.isConnected = false;
    this.emitEvent("close");
  }

  createTopic(options: RosbridgeTopicOptions): RosbridgeTopic {
    if (this.topicCreationError !== undefined) throw this.topicCreationError;
    const topic = new FakeRosbridgeTopic(options);
    this.topics.push(topic);
    return topic;
  }

  open(): void {
    this.isConnected = true;
    this.emitEvent("connection");
  }

  loseConnection(): void {
    this.isConnected = false;
    this.emitEvent("close");
  }

  private emitEvent(event: RosbridgeClientEvent, value?: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(value);
  }
}

class FakeRosbridgeClientFactory implements RosbridgeClientFactory {
  readonly clients: FakeRosbridgeClient[] = [];

  create(): FakeRosbridgeClient {
    const client = new FakeRosbridgeClient();
    this.clients.push(client);
    return client;
  }
}

function sourceDefinition(
  id: string,
  options: {
    readonly topic?: string;
    readonly messageType?: string;
    readonly type?: string;
    readonly connection?: string;
    readonly subscription?: Readonly<Record<string, unknown>>;
    readonly freshness?: Readonly<Record<string, unknown>>;
  } = {},
) {
  return {
    id,
    provider: ROSBRIDGE_PROVIDER_IDS.topicSource,
    type: options.type ?? MESSAGE_TYPE_ID,
    config: {
      connection: options.connection ?? "robot",
      topic: options.topic ?? "/ggcs_test/temperature",
      messageType: options.messageType ?? MESSAGE_TYPE,
      ...(options.subscription !== undefined
        ? { subscription: options.subscription }
        : {}),
      ...(options.freshness !== undefined ? { freshness: options.freshness } : {}),
    },
  } as const;
}

function application(sources: readonly ReturnType<typeof sourceDefinition>[]) {
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [ROS_PLUGIN_ID, ROSBRIDGE_PLUGIN_ID],
    resources: [
      {
        id: "robot",
        provider: ROSBRIDGE_PROVIDER_IDS.connection,
        type: CORE_TYPE_IDS.object,
        config: {
          url: "ws://robot:9090",
          reconnect: {
            enabled: true,
            initialDelayMs: 100,
            maxDelayMs: 1_000,
            multiplier: 2,
          },
        },
      },
      ...sources,
    ],
  } as const;
}

function compiled(
  factory: FakeRosbridgeClientFactory,
  sources: readonly ReturnType<typeof sourceDefinition>[] = [sourceDefinition("temperature.raw")],
) {
  const registry = createRegistryBuilder()
    .register(createRosDomainPlugin({ messageTypes: [MESSAGE_TYPE] }))
    .register(createRosbridgeTransportPlugin({ clientFactory: factory }));
  return compileApplication(application(sources), registry);
}

function rawSource(runtime: { resource<T>(id: string): T }, id = "temperature.raw") {
  return runtime.resource<Source<RosMessage>>(id);
}

describe("ROSBridge topic Source provider", () => {
  it("starts unavailable and publishes the raw ROS message as a fresh Observation", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const source = rawSource(runtime);
    expect(source.current()).toMatchObject({ state: "unavailable" });

    const client = factory.clients[0]!;
    client.open();
    expect(client.topics).toHaveLength(1);
    expect(client.topics[0]!.options).toEqual({
      topic: "/ggcs_test/temperature",
      messageType: MESSAGE_TYPE,
    });

    client.topics[0]!.emit({ data: 0 });
    expect(source.current()).toEqual({
      state: "fresh",
      value: { data: 0 },
      updatedAt: clock.wallNow(),
      provenance: { resourceIds: ["temperature.raw"] },
    });

    await runtime.stop();
  });

  it("keeps never-received telemetry unavailable across connection loss", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    const source = rawSource(runtime);
    client.open();
    client.loseConnection();

    expect(source.current()).toMatchObject({ state: "unavailable" });
    expect(runtime.resource<Connection>("robot").current()).toMatchObject({
      state: "reconnecting",
    });

    await runtime.stop();
  });

  it("marks last-good telemetry stale on disconnect and recovers fresh after reconnect", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    const source = rawSource(runtime);
    client.open();
    const firstPhysicalTopic = client.topics[0]!;
    firstPhysicalTopic.emit({ data: 31.5 });
    const firstObservation = source.current();
    expect(firstObservation).toMatchObject({ state: "fresh", value: { data: 31.5 } });

    clock.advanceBy(25);
    client.loseConnection();
    expect(source.current()).toEqual({
      ...(firstObservation.state === "fresh" ? firstObservation : {}),
      state: "stale",
      staleSince: clock.wallNow(),
    });
    expect(firstPhysicalTopic.unsubscribeCalls).toBe(1);

    const sourceIdentity = source;
    clock.advanceBy(100);
    expect(client.connectCalls).toHaveLength(2);
    client.open();
    expect(client.topics).toHaveLength(2);
    expect(client.topics[1]).not.toBe(firstPhysicalTopic);
    expect(runtime.resource("temperature.raw")).toBe(sourceIdentity);

    clock.advanceBy(10);
    client.topics[1]!.emit({ data: 32.25 });
    expect(source.current()).toEqual({
      state: "fresh",
      value: { data: 32.25 },
      updatedAt: clock.wallNow(),
      provenance: { resourceIds: ["temperature.raw"] },
    });

    await runtime.stop();
  });

  it("shares one physical subscription for equivalent semantic Sources", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      sourceDefinition("temperature.raw.a"),
      sourceDefinition("temperature.raw.b"),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    expect(client.topics).toHaveLength(1);
    expect(client.topics[0]!.subscribeCalls).toBe(1);

    client.topics[0]!.emit({ data: 7 });
    expect(rawSource(runtime, "temperature.raw.a").current()).toMatchObject({
      state: "fresh",
      value: { data: 7 },
    });
    expect(rawSource(runtime, "temperature.raw.b").current()).toMatchObject({
      state: "fresh",
      value: { data: 7 },
    });

    await runtime.stop();
    expect(client.topics[0]!.unsubscribeCalls).toBe(1);
  });

  it("does not pool subscriptions whose wire-significant options differ", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      sourceDefinition("temperature.fast", {
        subscription: { throttleRateMs: 0, queueLength: 1 },
      }),
      sourceDefinition("temperature.slow", {
        subscription: { throttleRateMs: 250, queueLength: 1 },
      }),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    expect(client.topics).toHaveLength(2);
    expect(client.topics.map((topic) => topic.options.throttleRateMs).sort()).toEqual([
      0,
      250,
    ]);

    await runtime.stop();
  });

  it("keeps physical subscription pools isolated across Runtime instances", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtimeDefinition = compiled(factory);
    const runtimeA = runtimeDefinition.createRuntime({ clock: new FakeClock() });
    const runtimeB = runtimeDefinition.createRuntime({ clock: new FakeClock() });
    await Promise.all([runtimeA.start(), runtimeB.start()]);

    factory.clients[0]!.open();
    factory.clients[1]!.open();
    expect(factory.clients).toHaveLength(2);
    expect(factory.clients[0]!.topics).toHaveLength(1);
    expect(factory.clients[1]!.topics).toHaveLength(1);
    expect(factory.clients[0]!.topics[0]).not.toBe(factory.clients[1]!.topics[0]);

    await Promise.all([runtimeA.stop(), runtimeB.stop()]);
  });

  it("maps physical subscription setup failure to Source error without failing Runtime", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.topicCreationError = new Error("bad subscription");
    client.open();

    expect(runtime.state()).toBe("running");
    expect(rawSource(runtime).current()).toMatchObject({
      state: "error",
      error: { code: "GGCS_ROSBRIDGE_TOPIC_SUBSCRIBE_FAILURE" },
    });

    await runtime.stop();
  });

  it("rejects mismatched nominal ROS message types before Runtime start", () => {
    const factory = new FakeRosbridgeClientFactory();
    const badType = rosMessageTypeId("std_msgs/msg/String");
    const registry = createRegistryBuilder()
      .register(
        createRosDomainPlugin({
          messageTypes: [MESSAGE_TYPE, "std_msgs/msg/String"],
        }),
      )
      .register(createRosbridgeTransportPlugin({ clientFactory: factory }));

    expect(() =>
      compileApplication(
        application([sourceDefinition("temperature.raw", { type: badType })]),
        registry,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "GGCS_ROSBRIDGE_TOPIC_SOURCE_CONFIG_INVALID" }),
    );
    expect(factory.clients).toHaveLength(0);
  });
});
