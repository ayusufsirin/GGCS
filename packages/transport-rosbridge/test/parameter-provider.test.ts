import { describe, expect, it } from "vitest";
import {
  compileApplication,
  createRegistryBuilder,
  type Parameter,
  type ParameterProvider,
  type Runtime,
} from "@ggcs/core";
import { ROS_PLUGIN_ID, createRosDomainPlugin } from "@ggcs/ros";
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

type ServiceSuccess = (response: unknown) => void;
type ServiceFailure = (error: unknown) => void;

interface FakeServiceCall {
  readonly request: unknown;
  readonly onSuccess: ServiceSuccess;
  readonly onError: ServiceFailure;
}

class FakeRosbridgeService implements RosbridgeService {
  readonly calls: FakeServiceCall[] = [];

  constructor(readonly options: RosbridgeServiceOptions) {}

  call(request: unknown, onSuccess: ServiceSuccess, onError: ServiceFailure): void {
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
    throw new Error("Parameter-only test must not create topics");
  }

  createService(options: RosbridgeServiceOptions): RosbridgeService {
    const service = new FakeRosbridgeService(options);
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

  service(name: string, generation = 0): FakeRosbridgeService {
    const matches = this.services.filter((service) => service.options.service === name);
    const service = matches[generation];
    if (!service) throw new Error(`Missing fake service ${name} generation ${generation}`);
    return service;
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

const PARAMETER_ID = "/ggcs_m02_topic_fixture:ggcs_test_parameter";

function parameterProviderDefinition(
  id = "fixture.parameters",
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    id,
    provider: ROSBRIDGE_PROVIDER_IDS.parameterProvider,
    type: CORE_TYPE_IDS.object,
    config: {
      connection: "robot",
      timeoutMs: 1_000,
      ...overrides,
    },
  } as const;
}

function application(resources = [parameterProviderDefinition()]) {
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
  resources = [parameterProviderDefinition()],
) {
  return compileApplication(
    application(resources),
    createRegistryBuilder()
      .register(createRosDomainPlugin())
      .register(createRosbridgeTransportPlugin({ clientFactory: factory })),
  );
}

function provider(runtime: Runtime, id = "fixture.parameters"): ParameterProvider {
  return runtime.resource<ParameterProvider>(id);
}

function completeDiscovery(
  client: FakeRosbridgeClient,
  names: readonly string[] = [PARAMETER_ID],
): void {
  const nodes = [...new Set(names.map((id) => id.slice(0, id.indexOf(":"))))];
  const nodesService = client.service("/rosapi/nodes", client.services.filter((s) => s.options.service === "/rosapi/nodes").length - 1);
  const namesService = client.service("/rosapi/get_param_names", client.services.filter((s) => s.options.service === "/rosapi/get_param_names").length - 1);
  const nodesCall = nodesService.calls.length - 1;
  const namesCall = namesService.calls.length - 1;
  nodesService.succeed(nodesCall, { nodes });
  namesService.succeed(namesCall, { names: [...names] });
}

async function discoverAndResolve(
  runtime: Runtime,
  client: FakeRosbridgeClient,
): Promise<Parameter<string>> {
  const listPromise = provider(runtime).list();
  completeDiscovery(client);
  await listPromise;
  return provider(runtime).resolve<string>(PARAMETER_ID);
}

describe("ROSBridge ParameterProvider", () => {
  it("discovers rosapi parameters as writable strings, supports queries, and never synthesizes defaults", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const allPromise = provider(runtime).list();
    completeDiscovery(client, [PARAMETER_ID, "/other_node:other"]);
    const all = await allPromise;
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ type: { id: CORE_TYPE_IDS.string }, writable: true });
    expect(all[0]).not.toHaveProperty("defaultValue");

    const prefixPromise = provider(runtime).list({ prefix: "/ggcs_m02_topic_fixture:" });
    completeDiscovery(client, [PARAMETER_ID, "/other_node:other"]);
    await expect(prefixPromise).resolves.toHaveLength(1);

    const readOnlyPromise = provider(runtime).list({ writable: false });
    completeDiscovery(client, [PARAMETER_ID]);
    await expect(readOnlyPromise).resolves.toEqual([]);
    await runtime.stop();
  });

  it("falls back to native ROS 2 ListParameters when rosapi get_param_names is empty", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const listPromise = provider(runtime).list({ prefix: "/ggcs_m02_topic_fixture:" });
    client.service("/rosapi/nodes").succeed(0, {
      nodes: ["/ggcs_m02_topic_fixture", "/rosapi", "/rosapi_params"],
    });
    client.service("/rosapi/get_param_names").succeed(0, { names: [] });
    await Promise.resolve();
    await Promise.resolve();

    const native = client.service("/ggcs_m02_topic_fixture/list_parameters");
    expect(native.options.serviceType).toBe("rcl_interfaces/srv/ListParameters");
    expect(native.calls[0]?.request).toEqual({ prefixes: [], depth: 0 });
    native.succeed(0, {
      result: { names: ["ggcs_test_parameter"], prefixes: [] },
    });

    await expect(listPromise).resolves.toEqual([
      expect.objectContaining({ id: PARAMETER_ID, writable: true }),
    ]);
    expect(
      client.services.some((service) => service.options.service === "/rosapi/list_parameters"),
    ).toBe(false);
    expect(
      client.services.some(
        (service) => service.options.service === "/rosapi_params/list_parameters",
      ),
    ).toBe(false);
    await runtime.stop();
  });

  it("uses native ListParameters when rosapi name discovery fails and ignores unrelated node failures", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const listPromise = provider(runtime).list();
    client.service("/rosapi/nodes").succeed(0, {
      nodes: ["/broken_node", "/ggcs_m02_topic_fixture"],
    });
    client.service("/rosapi/get_param_names").fail(0, new Error("humble discovery failed"));
    await Promise.resolve();
    await Promise.resolve();

    const broken = client.service("/broken_node/list_parameters");
    const fixture = client.service("/ggcs_m02_topic_fixture/list_parameters");
    broken.fail(0, new Error("parameter service unavailable"));
    fixture.succeed(0, {
      result: { names: ["ggcs_test_parameter"], prefixes: [] },
    });

    await expect(listPromise).resolves.toEqual([
      expect.objectContaining({ id: PARAMETER_ID, writable: true }),
    ]);
    await runtime.stop();
  });

  it("accepts an empty native discovery result when at least one node parameter service responds", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const listPromise = provider(runtime).list();
    client.service("/rosapi/nodes").succeed(0, { nodes: ["/empty_node"] });
    client.service("/rosapi/get_param_names").fail(0, new Error("humble discovery failed"));
    await Promise.resolve();
    await Promise.resolve();
    client.service("/empty_node/list_parameters").succeed(0, {
      result: { names: [], prefixes: [] },
    });

    await expect(listPromise).resolves.toEqual([]);
    await runtime.stop();
  });

  it("resolves discovered parameters with stable identity and initial unavailable value", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const direct = provider(runtime).resolve<string>(PARAMETER_ID);
    completeDiscovery(client);
    const parameter = await direct;
    expect(parameter.id).toBe(PARAMETER_ID);
    expect(parameter.kind).toBe("parameter");
    expect(parameter.value.current().state).toBe("unavailable");
    expect(parameter.descriptor).not.toHaveProperty("defaultValue");
    await expect(provider(runtime).resolve<string>(PARAMETER_ID)).resolves.toBe(parameter);
    await expect(provider(runtime).resolve("bad-id")).rejects.toMatchObject({
      code: "GGCS_ROSBRIDGE_PARAMETER_ID_INVALID",
    });
    await runtime.stop();
  });

  it("refreshes through get_param and publishes the raw rosapi string", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    const parameter = await discoverAndResolve(runtime, client);

    const invocation = parameter.refresh();
    const service = client.service("/rosapi/get_param");
    expect(service.calls[0]?.request).toEqual({ name: PARAMETER_ID, default_value: "" });
    service.succeed(0, { value: "12.5" });
    await expect(invocation.result()).resolves.toBe("12.5");
    expect(parameter.value.current()).toMatchObject({ state: "fresh", value: "12.5" });
    await runtime.stop();
  });

  it("writes exact string values without optimistic publication and confirms state only after refresh", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    const parameter = await discoverAndResolve(runtime, client);

    const firstRead = parameter.refresh();
    client.service("/rosapi/get_param").succeed(0, { value: "12.5" });
    await firstRead.result();

    const write = parameter.write("13.75");
    const setService = client.service("/rosapi/set_param");
    expect(setService.calls[0]?.request).toEqual({ name: PARAMETER_ID, value: "13.75" });
    setService.succeed(0, {});
    await expect(write.result()).resolves.toBeUndefined();
    expect(parameter.value.current()).toMatchObject({ state: "fresh", value: "12.5" });

    const reread = parameter.refresh();
    client.service("/rosapi/get_param").succeed(1, { value: "13.75" });
    await expect(reread.result()).resolves.toBe("13.75");
    expect(parameter.value.current()).toMatchObject({ state: "fresh", value: "13.75" });
    await runtime.stop();
  });

  it("maps rosapi discovery service errors and discovery timeouts to structured failures", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory, [parameterProviderDefinition("fixture.parameters", { timeoutMs: 50 })]).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();

    const failed = provider(runtime).list();
    client.service("/rosapi/nodes").fail(0, new Error("nodes failed"));
    client.service("/rosapi/get_param_names").succeed(0, { names: [] });
    await expect(failed).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_DISCOVERY_FAILURE" });

    const timed = provider(runtime).list();
    clock.advanceBy(50);
    await expect(timed).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_DISCOVERY_TIMEOUT" });
    await runtime.stop();
  });

  it("maps read failure and timeout to terminal Invocations while preserving last-good observation", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory, [parameterProviderDefinition("fixture.parameters", { timeoutMs: 50 })]).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    const parameter = await discoverAndResolve(runtime, client);
    const service = client.service("/rosapi/get_param");

    const ok = parameter.refresh();
    service.succeed(0, { value: "12.5" });
    await ok.result();

    const failed = parameter.refresh();
    service.fail(1, new Error("read failed"));
    await expect(failed.result()).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_READ_FAILURE" });
    expect(parameter.value.current()).toMatchObject({ state: "error", lastGood: { value: "12.5" } });

    const timed = parameter.refresh();
    clock.advanceBy(50);
    await Promise.resolve();
    expect(timed.current()).toMatchObject({ state: "timed_out", error: { code: "GGCS_ROSBRIDGE_PARAMETER_READ_TIMEOUT" } });
    await runtime.stop();
  });

  it("maps write failure and timeout without overwriting the last authoritative value", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory, [parameterProviderDefinition("fixture.parameters", { timeoutMs: 50 })]).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    const parameter = await discoverAndResolve(runtime, client);
    const read = parameter.refresh();
    client.service("/rosapi/get_param").succeed(0, { value: "12.5" });
    await read.result();

    const service = client.service("/rosapi/set_param");
    const failed = parameter.write("13");
    service.fail(0, new Error("write failed"));
    await expect(failed.result()).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_WRITE_FAILURE" });
    expect(parameter.value.current()).toMatchObject({ state: "fresh", value: "12.5" });

    const timed = parameter.write("14");
    clock.advanceBy(50);
    await Promise.resolve();
    expect(timed.current()).toMatchObject({ state: "timed_out", error: { code: "GGCS_ROSBRIDGE_PARAMETER_WRITE_TIMEOUT" } });
    expect(parameter.value.current()).toMatchObject({ state: "fresh", value: "12.5" });
    await runtime.stop();
  });

  it("fails active parameter operations on disconnect without replay and reuses the same Parameter after reconnect", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const clock = new FakeClock();
    const runtime = compiled(factory).createRuntime({ clock });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    const parameter = await discoverAndResolve(runtime, client);

    const read = parameter.refresh();
    const write = parameter.write("13");
    expect(client.service("/rosapi/get_param").calls).toHaveLength(1);
    expect(client.service("/rosapi/set_param").calls).toHaveLength(1);
    client.loseConnection();
    await expect(read.result()).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_READ_FAILURE" });
    await expect(write.result()).rejects.toMatchObject({ code: "GGCS_ROSBRIDGE_PARAMETER_WRITE_FAILURE" });

    clock.advanceBy(100);
    expect(client.connectCalls).toHaveLength(2);
    client.open();
    expect(client.service("/rosapi/get_param", 0).calls).toHaveLength(1);
    expect(client.service("/rosapi/set_param", 0).calls).toHaveLength(1);

    const reread = parameter.refresh();
    client.service("/rosapi/get_param", 1).succeed(0, { value: "15" });
    await expect(reread.result()).resolves.toBe("15");
    await expect(provider(runtime).resolve<string>(PARAMETER_ID)).resolves.toBe(parameter);
    await runtime.stop();
  });

  it("shares the four rosapi physical service clients across equivalent providers and releases by lease owner", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const runtime = compiled(factory, [
      parameterProviderDefinition("params.a"),
      parameterProviderDefinition("params.b"),
    ]).createRuntime({ clock: new FakeClock() });
    await runtime.start();
    const client = factory.clients[0]!;
    client.open();
    expect(client.services).toHaveLength(4);
    await runtime.stop();
    expect(client.closeCalls).toBe(1);
  });

  it("isolates rosapi service pools between Runtime instances even for the same endpoint", async () => {
    const factory = new FakeRosbridgeClientFactory();
    const compiledApp = compiled(factory);
    const first = compiledApp.createRuntime({ clock: new FakeClock() });
    const second = compiledApp.createRuntime({ clock: new FakeClock() });
    await first.start();
    await second.start();
    factory.clients[0]!.open();
    factory.clients[1]!.open();
    expect(factory.clients).toHaveLength(2);
    expect(factory.clients[0]!.services).toHaveLength(4);
    expect(factory.clients[1]!.services).toHaveLength(4);
    expect(factory.clients[0]!.services[0]).not.toBe(factory.clients[1]!.services[0]);
    await first.stop();
    await second.stop();
  });

  it("rejects malformed ParameterProvider configuration before Runtime start", () => {
    const factory = new FakeRosbridgeClientFactory();
    expect(() => compiled(factory, [parameterProviderDefinition("fixture.parameters", { timeoutMs: 0 })])).toThrowError(
      expect.objectContaining({ code: "GGCS_ROSBRIDGE_PARAMETER_PROVIDER_CONFIG_INVALID" }),
    );
    expect(factory.clients).toHaveLength(0);
  });
});
