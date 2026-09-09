import { describe, expect, it } from "vitest";
import {
  compileApplication,
  createRegistryBuilder,
  type Procedure,
  type Runtime,
} from "@ggcs/core";
import {
  ROS_PLUGIN_ID,
  createRosDomainPlugin,
  rosServiceTypeId,
  type RosServiceRequest,
  type RosServiceResponse,
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
  type RosbridgeService,
  type RosbridgeServiceOptions,
  type RosbridgeTopic,
  type RosbridgeTopicOptions,
} from "../src/index.js";

const SERVICE_TYPE = "std_srvs/srv/Trigger";
const SERVICE_TYPE_ID = rosServiceTypeId(SERVICE_TYPE);

type ServiceSuccess = (response: unknown) => void;
type ServiceFailure = (error: unknown) => void;

interface FakeServiceCall {
  readonly request: unknown;
  readonly onSuccess: ServiceSuccess;
  readonly onError: ServiceFailure;
}

class FakeRosbridgeService implements RosbridgeService {
  readonly calls: FakeServiceCall[] = [];
  callError: unknown | undefined;

  constructor(readonly options: RosbridgeServiceOptions) {}

  call(request: unknown, onSuccess: ServiceSuccess, onError: ServiceFailure): void {
    if (this.callError !== undefined) throw this.callError;
    this.calls.push({ request, onSuccess, onError });
  }

  succeed(index: number, response: unknown): void {
    this.calls[index]?.onSuccess(response);
  }

  fail(index: number, error: unknown): void {
    this.calls[index]?.onError(error);
  }
}

class FakeRosbridgeClient implements RosbridgeClient {
  isConnected = false;
  readonly connectCalls: string[] = [];
  readonly services: FakeRosbridgeService[] = [];
  closeCalls = 0;
  serviceCreationError: unknown | undefined;
  nextServiceCallError: unknown | undefined;
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
    throw new Error("Service-only test must not create topics");
  }

  createService(options: RosbridgeServiceOptions): RosbridgeService {
    if (this.serviceCreationError !== undefined) throw this.serviceCreationError;
    const service = new FakeRosbridgeService(options);
    if (this.nextServiceCallError !== undefined) {
      service.callError = this.nextServiceCallError;
      this.nextServiceCallError = undefined;
    }
    this.services.push(service);
    return service;
  }

  open(): void {
    this.isConnected = true;
    this.emit("connection");
  }

  loseConnection(): void {
    this.isConnected = false;
    this.emit("close");
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

function serviceDefinition(
  id = "fixture.trigger",
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    id,
    provider: ROSBRIDGE_PROVIDER_IDS.serviceProcedure,
    type: SERVICE_TYPE_ID,
    config: {
      connection: "robot",
      service: "/ggcs_test/trigger",
      serviceType: SERVICE_TYPE,
      timeoutMs: 1_000,
      ...overrides,
    },
  } as const;
}

function application(resources = [serviceDefinition()]) {
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
      ...resources,
    ],
  } as const;
}

function compiled(
  factory: FakeRosbridgeClientFactory,
  resources = [serviceDefinition()],
) {
  return compileApplication(
    application(resources),
    createRegistryBuilder()
      .register(createRosDomainPlugin({ serviceTypes: [SERVICE_TYPE] }))
      .register(createRosbridgeTransportPlugin({ clientFactory: factory })),
  );
}

function trigger(
  runtime: Runtime,
  id = "fixture.trigger",
): Procedure<RosServiceRequest, RosServiceResponse> {
  return runtime.resource<Procedure<RosServiceRequest, RosServiceResponse>>(id);
}

describe("ROSBridge service Procedure provider", () => {
  it("returns raw service responses and keeps concurrent Invocations independent", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const procedure = trigger(runtime);
    expect(client.services).toHaveLength(1);
    const service = client.services[0]!;

    const first = procedure.invoke({});
    const second = procedure.invoke({});
    expect(first.id).not.toBe(second.id);
    expect(first.current()).toMatchObject({ state: "pending" });
    expect(second.current()).toMatchObject({ state: "pending" });
    expect(service.calls.map((call) => call.request)).toEqual([{}, {}]);

    service.succeed(1, { success: true, message: "second" });
    expect(second.current()).toMatchObject({
      state: "succeeded",
      value: { success: true, message: "second" },
    });
    expect(first.current()).toMatchObject({ state: "pending" });

    service.succeed(0, { success: true, message: "first" });
    await expect(first.result()).resolves.toEqual({ success: true, message: "first" });
    await expect(second.result()).resolves.toEqual({ success: true, message: "second" });
    await runtime.stop();
  });

  it("maps configured timeout to timed_out and ignores a late service response", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory, [
      serviceDefinition("fixture.slow", { service: "/ggcs_test/slow", timeoutMs: 50 }),
    ]).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const invocation = trigger(runtime, "fixture.slow").invoke({});
    const service = client.services[0]!;
    clock.advanceBy(49);
    expect(invocation.current()).toMatchObject({ state: "pending" });
    clock.advanceBy(1);
    expect(invocation.current()).toMatchObject({
      state: "timed_out",
      error: {
        code: "GGCS_ROSBRIDGE_SERVICE_TIMEOUT",
        category: "invocation_timeout",
      },
    });
    await expect(invocation.result()).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_SERVICE_TIMEOUT",
    });

    service.succeed(0, { success: true, message: "late" });
    expect(invocation.current()).toMatchObject({ state: "timed_out" });
    await runtime.stop();
  });

  it("maps ROS service errors to structured Invocation failure", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const invocation = trigger(runtime).invoke({});
    client.services[0]!.fail(0, new Error("service rejected"));
    expect(invocation.current()).toMatchObject({
      state: "failed",
      error: {
        code: "GGCS_ROSBRIDGE_SERVICE_FAILURE",
        category: "invocation_failure",
        details: { service: "/ggcs_test/trigger", serviceType: SERVICE_TYPE },
      },
    });
    await runtime.stop();
  });

  it("fails an invocation while disconnected and never queues it for reconnect", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();

    const invocation = trigger(runtime).invoke({});
    expect(invocation.current()).toMatchObject({
      state: "failed",
      error: { code: "GGCS_ROSBRIDGE_SERVICE_UNAVAILABLE" },
    });
    const client = factory.clients[0]!;
    expect(client.services).toHaveLength(0);

    client.open();
    expect(client.services).toHaveLength(1);
    expect(client.services[0]!.calls).toHaveLength(0);
    await runtime.stop();
  });

  it("fails an in-flight call on disconnect, never replays it, and rebinds future calls", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const procedure = trigger(runtime);
    const procedureIdentity = procedure;
    const firstService = client.services[0]!;
    const first = procedure.invoke({ request: "first" });
    expect(firstService.calls).toHaveLength(1);

    client.loseConnection();
    expect(first.current()).toMatchObject({
      state: "failed",
      error: { code: "GGCS_ROSBRIDGE_SERVICE_CONNECTION_LOST" },
    });

    // A late response from the dead generation must not revive the Invocation.
    firstService.succeed(0, { success: true, message: "late" });
    expect(first.current()).toMatchObject({ state: "failed" });

    clock.advanceBy(100);
    client.open();
    expect(runtime.resource("fixture.trigger")).toBe(procedureIdentity);
    expect(client.services).toHaveLength(2);
    expect(client.services[1]).not.toBe(firstService);
    expect(client.services[1]!.calls).toHaveLength(0);

    const second = procedure.invoke({ request: "second" });
    expect(client.services[1]!.calls).toHaveLength(1);
    client.services[1]!.succeed(0, { success: true, message: "new generation" });
    await expect(second.result()).resolves.toEqual({
      success: true,
      message: "new generation",
    });
    await runtime.stop();
  });

  it("shares equivalent service clients but keeps distinct service names separate", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      serviceDefinition("fixture.a"),
      serviceDefinition("fixture.b"),
      serviceDefinition("fixture.other", { service: "/ggcs_test/other" }),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    expect(client.services).toHaveLength(2);
    const triggerService = client.services.find(
      (service) => service.options.service === "/ggcs_test/trigger",
    )!;
    trigger(runtime, "fixture.a").invoke({ a: 1 });
    trigger(runtime, "fixture.b").invoke({ b: 2 });
    expect(triggerService.calls.map((call) => call.request)).toEqual([{ a: 1 }, { b: 2 }]);
    await runtime.stop();
  });

  it("keeps service-client pools isolated across Runtime instances", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const definition = compiled(factory);
    const runtimeA = definition.createRuntime({ clock: new FakeClock() });
    const runtimeB = definition.createRuntime({ clock: new FakeClock() });
    await Promise.all([runtimeA.start(), runtimeB.start()]);

    factory.clients[0]!.open();
    factory.clients[1]!.open();
    expect(factory.clients).toHaveLength(2);
    expect(factory.clients[0]!.services).toHaveLength(1);
    expect(factory.clients[1]!.services).toHaveLength(1);
    expect(factory.clients[0]!.services[0]).not.toBe(factory.clients[1]!.services[0]);

    await Promise.all([runtimeA.stop(), runtimeB.stop()]);
  });

  it("terminally fails pending Invocations during Runtime disposal", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    factory.clients[0]!.open();

    const invocation = trigger(runtime).invoke({});
    expect(invocation.current()).toMatchObject({ state: "pending" });
    await runtime.stop();
    expect(invocation.current()).toMatchObject({
      state: "failed",
      error: { code: "GGCS_ROSBRIDGE_SERVICE_DISPOSED" },
    });
  });

  it("surfaces service-client setup and synchronous call failures without breaking Runtime", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.serviceCreationError = new Error("create failed");
    client.open();

    const setupFailure = trigger(runtime).invoke({});
    expect(setupFailure.current()).toMatchObject({
      state: "failed",
      error: { code: "GGCS_ROSBRIDGE_SERVICE_CLIENT_SETUP_FAILURE" },
    });
    expect(runtime.state()).toBe("running");

    client.serviceCreationError = undefined;
    client.nextServiceCallError = new Error("call failed");
    const callFailure = trigger(runtime).invoke({});
    expect(callFailure.current()).toMatchObject({
      state: "failed",
      error: { code: "GGCS_ROSBRIDGE_SERVICE_FAILURE" },
    });
    expect(runtime.state()).toBe("running");
    await runtime.stop();
  });

  it("rejects malformed service configuration before Runtime start", () => {
    const factory = new FakeRosbridgeClientFactory();
    expect(() =>
      compileApplication(
        application([
          serviceDefinition("fixture.bad", {
            service: "relative/service",
            serviceType: "std_srvs/Trigger",
            timeoutMs: 0,
          }),
        ]),
        createRegistryBuilder()
          .register(createRosDomainPlugin({ serviceTypes: [SERVICE_TYPE] }))
          .register(createRosbridgeTransportPlugin({ clientFactory: factory })),
      ),
    ).toThrow();
    expect(factory.clients).toHaveLength(0);
  });
});
