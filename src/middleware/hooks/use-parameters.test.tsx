import React from "react";
import { render } from "@testing-library/react";
import type { ParameterProvider } from "@ggcs/core";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "../../runtime/compatibility-map";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { type ParameterBrowserAccess, useParameterBrowser } from "./use-parameters";

const PARAMETER_INSTANCE = "tabs.items.rosParameters";

function access(provider?: ParameterProvider): SensorSuiteCompatibilityAccess {
  return {
    runtimeState: () => "running",
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: () => undefined,
    resourceForCapability: () => provider as any,
  };
}

function captureAccess(runtimeAccess: SensorSuiteCompatibilityAccess): ParameterBrowserAccess {
  let captured: ParameterBrowserAccess | undefined;
  function Probe() {
    captured = useParameterBrowser();
    return null;
  }
  render(
    <RuntimeCompatibilityProvider access={runtimeAccess}>
      <WidgetAttrProvider instanceId={PARAMETER_INSTANCE}><Probe /></WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
  return captured!;
}

describe("M05 Runtime-only ParameterProvider hook", () => {
  test("lists, resolves, refreshes, and writes through ParameterProvider", async () => {
    const refresh = jest.fn(() => ({ result: async () => "11" } as any));
    const write = jest.fn((_value: string) => ({ result: async () => undefined } as any));
    const parameter = { kind: "parameter", id: "/alpha:param_a", refresh, write } as any;
    const list = jest.fn(async (query?: { prefix?: string }) => query?.prefix
      ? [{ id: "/alpha:param_a" }, { id: "/alpha:param_b" }]
      : [{ id: "/alpha:param_a" }, { id: "/beta:param_b" }]);
    const resolve = jest.fn(async () => parameter);
    const provider = { kind: "parameter_provider", id: "parameters", list, resolve } as any;
    const parameters = captureAccess(access(provider));

    await expect(parameters.listNodes()).resolves.toEqual(["/alpha", "/beta"]);
    await expect(parameters.listParameterIds("/alpha")).resolves.toEqual(["/alpha:param_a", "/alpha:param_b"]);
    await expect(parameters.read("/alpha:param_a")).resolves.toBe("11");
    await parameters.write("/alpha:param_a", "99");

    expect(list).toHaveBeenCalledWith({ prefix: "/alpha:" });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("99");
  });

  test("fails closed when the mapped ParameterProvider is unavailable", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => captureAccess(access(undefined))).toThrow(/ParameterProvider unavailable/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
