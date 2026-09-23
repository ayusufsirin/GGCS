import React from "react";
import { act, render } from "@testing-library/react";
import { publisherBus } from "../publisher-bus";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { usePublisher } from "./use-publisher";

function access(mode: SensorSuiteCompatibilityAccess["mode"]): SensorSuiteCompatibilityAccess {
  return {
    mode,
    runtimeEnabled: mode !== "legacy",
    runtimeState: () => (mode === "legacy" ? "disabled" : "running"),
    resolvePort: () => undefined,
    resolveCapability: () => undefined,
    resourceForPort: () => undefined,
    resourceForCapability: () => undefined,
  };
}

function capturePublisher(mode: SensorSuiteCompatibilityAccess["mode"]) {
  let publish: ((value: unknown) => void) | undefined;
  function Probe() { publish = usePublisher("command"); return null; }
  render(
    <RuntimeCompatibilityProvider access={access(mode)}>
      <WidgetAttrProvider instanceId="test.publisher"><Probe /></WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
  if (!publish) throw new Error("publisher not captured");
  return publish;
}

describe("M04-S6 publisher compatibility closure", () => {
  test("compat-full never consults publisherBus for an unmapped Command", () => {
    const get = jest.spyOn(publisherBus, "get");
    const publish = capturePublisher("compat-full");
    expect(() => publish({ value: 1 })).toThrow(/compat-full has no Runtime Command mapping/);
    expect(get).not.toHaveBeenCalled();
  });

  test("legacy rollback retains publisherBus behavior", () => {
    const legacy = jest.fn();
    const off = publisherBus.register("test.publisher", "command", legacy);
    try {
      const publish = capturePublisher("legacy");
      act(() => publish({ value: 2 }));
      expect(legacy).toHaveBeenCalledWith({ value: 2 });
    } finally { off(); }
  });
});
