import { describe, expect, it } from "vitest";
import {
  compileApplication,
  createRegistryBuilder,
  type Command,
  type Runtime,
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
  advertiseCalls = 0;
  unadvertiseCalls = 0;
  readonly published: unknown[] = [];
  advertiseError: unknown | undefined;
  publishError: unknown | undefined;

  constructor(readonly options: RosbridgeTopicOptions) {}

  subscribe(listener: RosbridgeTopicListener): void {
    this.subscribeCalls += 1;
    this.listeners.add(listener);
  }

  unsubscribe(listener: RosbridgeTopicListener): void {
    this.unsubscribeCalls += 1;
    this.listeners.delete(listener);
  }

  advertise(): void {
    this.advertiseCalls += 1;
    if (this.advertiseError !== undefined) throw this.advertiseError;
  }

  unadvertise(): void {
    this.unadvertiseCalls += 1;
  }

  publish(message: unknown): void {
    if (this.publishError !== undefined) throw this.publishError;
    this.published.push(message);
  }
}

class FakeRosbridgeClient implements RosbridgeClient {
  isConnected = false;
  readonly connectCalls: string[] = [];
  readonly topics: FakeRosbridgeTopic[] = [];
  closeCalls = 0;
  topicCreationError: unknown | undefined;
  nextAdvertiseError: unknown | undefined;
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
    topic.advertiseError = this.nextAdvertiseError;
    this.nextAdvertiseError = undefined;
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

function commandDefinition(
  id: string,
  options: {
    readonly topic?: string;
    readonly messageType?: string;
    readonly type?: string;
    readonly connection?: string;
    readonly publish?: Readonly<Record<string, unknown>>;
  } = {},
) {
  return {
    id,
    provider: ROSBRIDGE_PROVIDER_IDS.topicCommand,
    type: options.type ?? MESSAGE_TYPE_ID,
    config: {
      connection: options.connection ?? "robot",
      topic: options.topic ?? "/ggcs_test/command",
      messageType: options.messageType ?? MESSAGE_TYPE,
      ...(options.publish !== undefined ? { publish: options.publish } : {}),
    },
  } as const;
}

function application(commands: readonly ReturnType<typeof commandDefinition>[]) {
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
      ...commands,
    ],
  } as const;
}

function compiled(
  factory: FakeRosbridgeClientFactory,
  commands: readonly ReturnType<typeof commandDefinition>[] = [
    commandDefinition("motor.command.raw"),
  ],
) {
  const registry = createRegistryBuilder()
    .register(createRosDomainPlugin({ messageTypes: [MESSAGE_TYPE] }))
    .register(createRosbridgeTransportPlugin({ clientFactory: factory }));
  return compileApplication(application(commands), registry);
}

function rawCommand(runtime: Runtime, id = "motor.command.raw") {
  return runtime.resource<Command<RosMessage>>(id);
}

describe("ROSBridge topic Command provider", () => {
  it("publishes a raw ROS message and returns a dispatch receipt without implying acknowledgement", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    const command = rawCommand(runtime);
    expect(client.topics).toHaveLength(1);
    expect(client.topics[0]!.options).toEqual({
      topic: "/ggcs_test/command",
      messageType: MESSAGE_TYPE,
    });
    expect(client.topics[0]!.advertiseCalls).toBe(1);

    clock.advanceBy(25);
    const receipt = await command.send({ data: 42 });
    expect(receipt).toEqual({
      dispatchedAt: clock.wallNow(),
      metadata: {
        connection: "robot",
        topic: "/ggcs_test/command",
        messageType: MESSAGE_TYPE,
        sessionGeneration: 1,
      },
    });
    expect(client.topics[0]!.published).toEqual([{ data: 42 }]);

    await runtime.stop();
    expect(client.topics[0]!.unadvertiseCalls).toBe(1);
  });

  it("never queues across disconnect and recreates the physical publisher after reconnect", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const command = rawCommand(runtime);
    const client = factory.clients[0]!;
    await expect(command.send({ data: 1 })).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_COMMAND_UNAVAILABLE",
      category: "command_dispatch",
    });
    expect(client.topics).toHaveLength(0);

    client.open();
    const firstPhysicalPublisher = client.topics[0]!;
    await command.send({ data: 2 });
    expect(firstPhysicalPublisher.published).toEqual([{ data: 2 }]);

    client.loseConnection();
    // The dead session needs no unadvertise frame. Skipping it also prevents
    // ROSLIB from queueing an old-session unadvertise into the reconnect.
    expect(firstPhysicalPublisher.unadvertiseCalls).toBe(0);
    await expect(command.send({ data: 3 })).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_COMMAND_UNAVAILABLE",
    });
    expect(firstPhysicalPublisher.published).toEqual([{ data: 2 }]);

    const commandIdentity = command;
    clock.advanceBy(100);
    client.open();
    expect(client.topics).toHaveLength(2);
    expect(client.topics[1]).not.toBe(firstPhysicalPublisher);
    expect(runtime.resource("motor.command.raw")).toBe(commandIdentity);

    await command.send({ data: 4 });
    expect(client.topics[1]!.published).toEqual([{ data: 4 }]);

    await runtime.stop();
  });

  it("shares one physical advertised publisher for equivalent semantic Commands", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      commandDefinition("motor.command.a"),
      commandDefinition("motor.command.b"),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    expect(client.topics).toHaveLength(1);
    expect(client.topics[0]!.advertiseCalls).toBe(1);

    await rawCommand(runtime, "motor.command.a").send({ data: 10 });
    await rawCommand(runtime, "motor.command.b").send({ data: 11 });
    expect(client.topics[0]!.published).toEqual([{ data: 10 }, { data: 11 }]);

    await runtime.stop();
    expect(client.topics[0]!.unadvertiseCalls).toBe(1);
  });

  it("does not pool publishers whose wire-significant publish options differ", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      commandDefinition("motor.command.queue1", {
        publish: { queueSize: 1, latch: false },
      }),
      commandDefinition("motor.command.queue5", {
        publish: { queueSize: 5, latch: false },
      }),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    expect(client.topics).toHaveLength(2);
    expect(client.topics.map((topic) => topic.options.queueSize).sort()).toEqual([1, 5]);

    await runtime.stop();
  });

  it("keeps publisher pools isolated across Runtime instances", async () => {
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

  it("maps physical publisher setup failure to deterministic command dispatch failure", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.topicCreationError = new Error("publisher setup failed");
    client.open();

    await expect(rawCommand(runtime).send({ data: 1 })).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_TOPIC_PUBLISHER_SETUP_FAILURE",
      category: "command_dispatch",
    });
    expect(runtime.state()).toBe("running");

    await runtime.stop();
  });

  it("maps ROSLIB publish failure without retrying the command", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    client.topics[0]!.publishError = new Error("socket write failed");

    await expect(rawCommand(runtime).send({ data: 9 })).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_COMMAND_DISPATCH_FAILURE",
      category: "command_dispatch",
    });
    expect(client.topics[0]!.published).toEqual([]);

    await runtime.stop();
  });

  it("rejects non-object messages and mismatched nominal ROS message types", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    factory.clients[0]!.open();

    await expect(
      rawCommand(runtime).send(42 as unknown as RosMessage),
    ).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_COMMAND_MESSAGE_INVALID" });
    await runtime.stop();

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
        application([commandDefinition("motor.command.raw", { type: badType })]),
        registry,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "GGCS_ROSBRIDGE_TOPIC_COMMAND_CONFIG_INVALID" }),
    );
  });
});
