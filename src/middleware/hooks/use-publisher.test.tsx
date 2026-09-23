import React from "react";
import { render } from "@testing-library/react";
import type { Command } from "@ggcs/core";
import { RuntimeCompatibilityProvider } from "../../runtime/compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "../../runtime/sensor-suite-application";
import { WidgetAttrProvider } from "./common";
import { usePublisher } from "./use-publisher";

function capturePublisher(access: SensorSuiteCompatibilityAccess) {
  let publish: ((value: number) => unknown) | undefined;
  function Probe() {
    publish = usePublisher<number>("command");
    return null;
  }
  render(
    <RuntimeCompatibilityProvider access={access}>
      <WidgetAttrProvider instanceId="test.publisher"><Probe /></WidgetAttrProvider>
    </RuntimeCompatibilityProvider>,
  );
  return (value: number) => publish!(value);
}

describe("M05 Runtime-only Command compatibility hook", () => {
  test("dispatches a mapped Runtime Command", async () => {
    const send = jest.fn(async () => ({ dispatchedAt: 1 }));
    const command = { kind: "command", id: "test.command", send } as unknown as Command<number>;
    const access: SensorSuiteCompatibilityAccess = {
      runtimeState: () => "running",
      resolvePort: () => ({ kind: "command", resourceId: "test.command" }),
      resolveCapability: () => undefined,
      resourceForPort: () => command as any,
      resourceForCapability: () => undefined,
    };
    await capturePublisher(access)(3);
    expect(send).toHaveBeenCalledWith(3);
  });

  test("unmapped Commands fail closed instead of consulting a legacy publisher bus", () => {
    const access: SensorSuiteCompatibilityAccess = {
      runtimeState: () => "running",
      resolvePort: () => undefined,
      resolveCapability: () => undefined,
      resourceForPort: () => undefined,
      resourceForCapability: () => undefined,
    };
    const publish = capturePublisher(access);
    expect(() => publish(1)).toThrow(/no Runtime Command mapping/);
  });
});
