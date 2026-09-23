import React from "react";
import { render } from "@testing-library/react";
import type {
  Invocation,
  InvocationState,
  Parameter,
  ParameterProvider,
  Subscription,
} from "@ggcs/core";
import { serviceBus, svcKey } from "../service-bus";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { useParameterBrowser, type ParameterBrowserAccess } from "./use-parameters";

const PARAMETER_INSTANCE = "tabs.items.rosParameters";

function immediateInvocation<T>(value: T): Invocation<T> {
  const state: InvocationState<T> = { state: "succeeded", value, completedAt: 1 };
  return {
    id: "test-invocation",
    current: () => state,
    subscribe(listener): Subscription {
      listener(state);
      let closed = false;
      return {
        get closed() { return closed; },
        unsubscribe() { closed = true; },
      };
    },
    result: async () => value,
  };
}

class FakeParameter implements Parameter<string> {
  readonly kind = "parameter" as const;
  readonly descriptor: any;
  readonly value: any = {
    kind: "source",
    id: "test.parameter.value",
    current: () => ({ state: "unavailable", since: 0 }),
    subscribe: () => ({ closed: false, unsubscribe: () => undefined }),
  };
  refreshes = 0;
  writes: string[] = [];

  constructor(readonly id: string, private currentValue: string) {
    this.descriptor = {
      id,
      type: { id: "ggcs:type/string", schema: { type: "string" } },
      writable: true,
    };
  }

  refresh(): Invocation<string> {
    this.refreshes += 1;
    return immediateInvocation(this.currentValue);
  }

  write(value: string): Invocation<void> {
    this.writes.push(value);
    this.currentValue = value;
    return immediateInvocation(undefined);
  }
}

class FakeParameterProvider implements ParameterProvider {
  readonly kind = "parameter_provider" as const;
  readonly id = "shadow.parameters";
  readonly listQueries: Array<{ prefix?: string; writable?: boolean } | undefined> = [];
  readonly resolves: string[] = [];
  readonly parameters = new Map<string, FakeParameter>([
    ["/alpha:param_a", new FakeParameter("/alpha:param_a", "11")],
    ["/alpha:param_b", new FakeParameter("/alpha:param_b", "12")],
    ["/beta:param_c", new FakeParameter("/beta:param_c", "21")],
  ]);

  async list(query?: { prefix?: string; writable?: boolean }) {
    this.listQueries.push(query);
    return Array.from(this.parameters.values())
      .map((parameter) => parameter.descriptor)
      .filter((descriptor) => !query?.prefix || descriptor.id.startsWith(query.prefix));
  }

  async resolve<T = unknown>(id: string): Promise<Parameter<T>> {
    this.resolves.push(id);
    const parameter = this.parameters.get(id);
    if (!parameter) throw new Error(`unknown parameter ${id}`);
    return parameter as unknown as Parameter<T>;
  }
}

function compatibilityAccess(
  provider: ParameterProvider | undefined,
  mode: SensorSuiteCompatibilityAccess["mode"] = "compat-read",
): SensorSuiteCompatibilityAccess {
  return {
    mode,
    runtimeEnabled: mode !== "legacy",
    runtimeState: () => (mode === "legacy" ? "disabled" : "running"),
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: () => undefined,
    resourceForCapability: (instanceId, capabilityName) => {
      const binding = resolveCompatibilityCapability(instanceId, capabilityName);
      if (!binding || binding.kind !== "parameterProvider") return undefined;
      return provider as any;
    },
  };
}

function captureAccess(access: SensorSuiteCompatibilityAccess): ParameterBrowserAccess {
  let captured: ParameterBrowserAccess | undefined;
  function Probe() {
    captured = useParameterBrowser();
    return null;
  }
  render(
    <RuntimeCompatibilityProvider access={access}>
      <WidgetAttrProvider instanceId={PARAMETER_INSTANCE}>
        <Probe />
      </WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
  if (!captured) throw new Error("parameter access was not captured");
  return captured;
}

describe("M04-S5 ParameterProvider compatibility", () => {
  afterEach(() => jest.restoreAllMocks());

  test("compat-read lists, resolves, refreshes and writes through ParameterProvider only", async () => {
    const provider = new FakeParameterProvider();
    const busCall = jest.spyOn(serviceBus, "call");
    const parameters = captureAccess(compatibilityAccess(provider));

    await expect(parameters.listNodes()).resolves.toEqual(["/alpha", "/beta"]);
    await expect(parameters.listParameterIds("/alpha")).resolves.toEqual([
      "/alpha:param_a",
      "/alpha:param_b",
    ]);
    await expect(parameters.read("/alpha:param_a")).resolves.toBe("11");
    await parameters.write("/alpha:param_a", "99");

    expect(provider.listQueries).toEqual([undefined, { prefix: "/alpha:" }]);
    expect(provider.resolves).toEqual(["/alpha:param_a", "/alpha:param_a"]);
    expect(provider.parameters.get("/alpha:param_a")!.refreshes).toBe(1);
    expect(provider.parameters.get("/alpha:param_a")!.writes).toEqual(["99"]);
    expect(busCall).not.toHaveBeenCalled();
  });

  test("compat-full uses ParameterProvider without consulting serviceBus", async () => {
    const provider = new FakeParameterProvider();
    const busCall = jest.spyOn(serviceBus, "call");
    const parameters = captureAccess(compatibilityAccess(provider, "compat-full"));

    await expect(parameters.read("/alpha:param_a")).resolves.toBe("11");
    await parameters.write("/alpha:param_a", "13");
    expect(busCall).not.toHaveBeenCalled();
  });

  test("compat-read fails closed when the mapped ParameterProvider is unavailable", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => captureAccess(compatibilityAccess(undefined))).toThrow(
        /compat ParameterProvider unavailable/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  test("legacy mode remains a restart-based rollback through the old service bus", async () => {
    const provider = new FakeParameterProvider();
    const listNodes = jest.fn(async () => ({ nodes: ["/legacy"] }));
    const getParamNames = jest.fn(async () => ({ names: ["/legacy:one", "/other:two"] }));
    const getParam = jest.fn(async (req: { name: string }) => ({ value: `value:${req.name}` }));
    const setParam = jest.fn(async () => ({}));
    const off = [
      serviceBus.register(svcKey(PARAMETER_INSTANCE, "listNodes"), listNodes),
      serviceBus.register(svcKey(PARAMETER_INSTANCE, "getParamNames"), getParamNames),
      serviceBus.register(svcKey(PARAMETER_INSTANCE, "getParam"), getParam),
      serviceBus.register(svcKey(PARAMETER_INSTANCE, "setParam"), setParam),
    ];

    try {
      const parameters = captureAccess(compatibilityAccess(provider, "legacy"));

      await expect(parameters.listNodes()).resolves.toEqual(["/legacy"]);
      await expect(parameters.listParameterIds("/legacy")).resolves.toEqual(["/legacy:one"]);
      await expect(parameters.read("/legacy:one")).resolves.toBe("value:/legacy:one");
      await parameters.write("/legacy:one", "new");

      expect(listNodes).toHaveBeenCalledTimes(1);
      expect(getParamNames).toHaveBeenCalledTimes(1);
      expect(getParam).toHaveBeenCalledWith({ name: "/legacy:one" }, { timeoutMs: 8_000 });
      expect(setParam).toHaveBeenCalledWith(
        { name: "/legacy:one", value: "new" },
        { timeoutMs: 10_000 },
      );
      expect(provider.listQueries).toEqual([]);
      expect(provider.resolves).toEqual([]);
    } finally {
      off.forEach((dispose) => dispose());
    }
  });
});
