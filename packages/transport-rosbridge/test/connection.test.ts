import { describe, expect, it } from "vitest";
import {
  compileApplication,
  createRegistryBuilder,
  type Connection,
} from "@ggcs/core";
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
  type RosbridgeService,
  type RosbridgeServiceOptions,
  type RosbridgeTopic,
  type RosbridgeTopicOptions,
} from "../src/index.js";

class FakeRosbridgeClient implements RosbridgeClient {
  isConnected = false;
  readonly connectCalls: string[] = [];
  closeCalls = 0;
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
    this.emit("close");
  }

  createTopic(_options: RosbridgeTopicOptions): RosbridgeTopic {
    throw new Error("Connection-only test must not create topics");
  }

  createService(_options: RosbridgeServiceOptions): RosbridgeService {
    throw new Error("Topic/connection test must not create services");
  }

  open(): void {
    this.isConnected = true;
    this.emit("connection");
  }

  loseConnection(): void {
    this.isConnected = false;
    this.emit("close");
  }

  fail(error: unknown = new Error("socket failure")): void {
    this.emit("error", error);
  }

  private emit(event: RosbridgeClientEvent, value?: unknown): void {
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

function definition(reconnect: Readonly<Record<string, unknown>> = {
  enabled: true,
  initialDelayMs: 100,
  maxDelayMs: 1_000,
  multiplier: 2,
}) {
  return {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: [ROSBRIDGE_PLUGIN_ID],
    resources: [
      {
        id: "robot",
        provider: ROSBRIDGE_PROVIDER_IDS.connection,
        type: CORE_TYPE_IDS.object,
        config: {
          url: "ws://robot:9090",
          reconnect,
        },
      },
    ],
  } as const;
}

function compiled(factory: FakeRosbridgeClientFactory, reconnect?: Readonly<Record<string, unknown>>) {
  return compileApplication(
    definition(reconnect),
    createRegistryBuilder().register(
      createRosbridgeTransportPlugin({ clientFactory: factory }),
    ),
  );
}

describe("ROSBridge Connection provider", () => {
  it("has no live client before Runtime start and exposes observational connection state", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtimeDefinition = compiled(factory);
    expect(factory.clients).toHaveLength(0);

    const runtime = runtimeDefinition.createRuntime({ clock });
    await runtime.start();
    expect(runtime.state()).toBe("running");
    expect(factory.clients).toHaveLength(1);

    const client = factory.clients[0]!;
    const connection = runtime.resource<Connection>("robot");
    expect(client.connectCalls).toEqual(["ws://robot:9090"]);
    expect(connection.current()).toMatchObject({ state: "connecting" });

    const observed: string[] = [];
    const subscription = connection.subscribe((state) => observed.push(state.state));
    client.open();
    expect(connection.current()).toMatchObject({ state: "connected" });
    expect(observed).toEqual(["connecting", "connected"]);

    subscription.unsubscribe();
    await runtime.stop();
    expect(client.closeCalls).toBe(1);
    expect(connection.current()).toMatchObject({ state: "disconnected" });
  });

  it("keeps Runtime running and maintains exactly one reconnect loop per Connection", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    const connection = runtime.resource<Connection>("robot");
    client.open();
    client.loseConnection();

    expect(runtime.state()).toBe("running");
    expect(connection.current()).toEqual({
      state: "reconnecting",
      since: clock.wallNow(),
      attempt: 1,
    });

    // Duplicate close while already waiting must not schedule another loop.
    client.loseConnection();
    expect(connection.current()).toMatchObject({ state: "reconnecting", attempt: 1 });

    clock.advanceBy(99);
    expect(client.connectCalls).toHaveLength(1);
    clock.advanceBy(1);
    expect(client.connectCalls).toHaveLength(2);
    expect(connection.current()).toMatchObject({ state: "connecting" });

    // A failed reconnect before a successful session advances backoff attempt.
    client.loseConnection();
    expect(connection.current()).toMatchObject({ state: "reconnecting", attempt: 2 });
    clock.advanceBy(199);
    expect(client.connectCalls).toHaveLength(2);
    clock.advanceBy(1);
    expect(client.connectCalls).toHaveLength(3);
    expect(factory.clients).toHaveLength(1);

    client.open();
    expect(connection.current()).toMatchObject({ state: "connected" });
    expect(runtime.resource("robot")).toBe(connection);
    await runtime.stop();
  });

  it("maps ROSLIB errors to degraded state and lets close drive one reconnect", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    const connection = runtime.resource<Connection>("robot");
    client.fail(new Error("connection refused"));
    expect(connection.current()).toMatchObject({
      state: "degraded",
      reason: { code: "GGCS_ROSBRIDGE_CONNECTION_FAILURE" },
    });
    client.loseConnection();
    expect(connection.current()).toMatchObject({ state: "reconnecting", attempt: 1 });
    clock.advanceBy(100);
    expect(client.connectCalls).toHaveLength(2);

    await runtime.stop();
  });

  it("Runtime stop cancels pending reconnect activity", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    client.open();
    client.loseConnection();
    expect(client.connectCalls).toHaveLength(1);

    await runtime.stop();
    clock.advanceBy(10_000);
    expect(client.connectCalls).toHaveLength(1);
  });

  it("supports reconnect-disabled connections", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory, { enabled: false }).createRuntime({ clock });
    await runtime.start();

    const client = factory.clients[0]!;
    const connection = runtime.resource<Connection>("robot");
    client.open();
    client.loseConnection();
    expect(connection.current()).toMatchObject({ state: "disconnected" });
    clock.advanceBy(10_000);
    expect(client.connectCalls).toHaveLength(1);

    await runtime.stop();
  });

  it("isolates ROSLIB sessions across Runtime instances", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtimeDefinition = compiled(factory);
    const runtimeA = runtimeDefinition.createRuntime({ clock: new FakeClock() });
    const runtimeB = runtimeDefinition.createRuntime({ clock: new FakeClock() });

    await Promise.all([runtimeA.start(), runtimeB.start()]);
    expect(factory.clients).toHaveLength(2);
    expect(factory.clients[0]).not.toBe(factory.clients[1]);
    expect(runtimeA.resource("robot")).not.toBe(runtimeB.resource("robot"));

    await Promise.all([runtimeA.stop(), runtimeB.stop()]);
    expect(factory.clients[0]!.closeCalls).toBe(1);
    expect(factory.clients[1]!.closeCalls).toBe(1);
  });

  it("rejects malformed connection configuration before Runtime start", () => {
    const factory = new FakeRosbridgeClientFactory();
    const badDefinition = {
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: [ROSBRIDGE_PLUGIN_ID],
      resources: [
        {
          id: "robot",
          provider: ROSBRIDGE_PROVIDER_IDS.connection,
          type: CORE_TYPE_IDS.object,
          config: { url: "http://robot:9090" },
        },
      ],
    } as const;

    expect(() =>
      compileApplication(
        badDefinition,
        createRegistryBuilder().register(
          createRosbridgeTransportPlugin({ clientFactory: factory }),
        ),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "GGCS_ROSBRIDGE_CONNECTION_CONFIG_INVALID" }),
    );
    expect(factory.clients).toHaveLength(0);
  });
});
