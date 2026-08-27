import { describe, expect, it } from "vitest";
import {
  RuntimeError,
  compileApplication,
  createInvocationController,
  createRegistryBuilder,
  type Command,
  type ParameterProvider,
  type Procedure,
} from "@ggcs/core";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import { FakeClock, TEST_PROVIDER_IDS, TestCommand, createTestingPlugin } from "../src/index.js";

describe("Command/Invocation/Procedure/Parameter", () => {
  it("keeps command intent separate from feedback", async () => {
    const testing = createTestingPlugin();
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin"],
      resources: [
        { id: "command", provider: TEST_PROVIDER_IDS.command, type: CORE_TYPE_IDS.boolean },
        { id: "feedback", provider: TEST_PROVIDER_IDS.source, type: CORE_TYPE_IDS.boolean, config: { initial: false } },
      ],
    }, createRegistryBuilder().register(testing.plugin));
    const clock = new FakeClock();
    const runtime = compiled.createRuntime({ clock });
    await runtime.start();
    const command = runtime.resource<TestCommand<boolean>>("command");
    const receipt = await command.send(true);
    expect(receipt.dispatchedAt).toBe(clock.wallNow());
    expect(command.sent).toEqual([true]);
    expect(runtime.resource<any>("feedback").current()).toMatchObject({ value: false });
    command.failNext = new RuntimeError({ code: "DISPATCH", category: "command_dispatch", message: "nope" });
    await expect(command.send(false)).rejects.toMatchObject({ code: "DISPATCH" });
    await runtime.stop();
  });

  it("models independent invocation success/failure/timeout", async () => {
    const clock = new FakeClock();
    const ok = createInvocationController<number>({ clock, timeoutMs: 100 });
    const failed = createInvocationController<number>({ clock });
    const timed = createInvocationController<number>({ clock, timeoutMs: 10 });
    ok.succeed(7);
    failed.fail(new Error("boom"));
    clock.advanceBy(10);
    await expect(ok.invocation.result()).resolves.toBe(7);
    await expect(failed.invocation.result()).rejects.toMatchObject({ category: "invocation_failure" });
    await expect(timed.invocation.result()).rejects.toMatchObject({ category: "invocation_timeout" });
  });

  it("executes procedure and parameter operations through invocations", async () => {
    const testing = createTestingPlugin();
    const compiled = compileApplication({
      schemaVersion: GGCS_SCHEMA_VERSION,
      plugins: ["testing:plugin"],
      resources: [
        { id: "calibrate", provider: TEST_PROVIDER_IDS.procedure, type: CORE_TYPE_IDS.object, config: { result: { ok: true }, delayMs: 5, timeoutMs: 50 } },
        {
          id: "params",
          provider: TEST_PROVIDER_IDS.parameterProvider,
          type: CORE_TYPE_IDS.object,
          config: { parameters: [
            { id: "target", type: CORE_TYPE_IDS.number, writable: true, initial: 20, defaultValue: 21, minimum: 10, maximum: 30 },
            { id: "readOnly", type: CORE_TYPE_IDS.number, writable: false, initial: 1 },
          ] },
        },
      ],
    }, createRegistryBuilder().register(testing.plugin));
    const clock = new FakeClock();
    const runtime = compiled.createRuntime({ clock });
    await runtime.start();

    const procedure = runtime.resource<Procedure<{}, { ok: boolean }>>("calibrate");
    const invocation = procedure.invoke({});
    expect(invocation.current().state).toBe("pending");
    clock.advanceBy(5);
    await expect(invocation.result()).resolves.toEqual({ ok: true });

    const provider = runtime.resource<ParameterProvider>("params");
    expect((await provider.list()).map((item) => item.id)).toEqual(["target", "readOnly"]);
    const target = await provider.resolve<number>("target");
    expect(target.descriptor.defaultValue).toBe(21);
    const invalid = target.write(99);
    clock.advanceBy(0);
    await expect(invalid.result()).rejects.toMatchObject({ category: "parameter_validation" });
    expect(target.value.current()).toMatchObject({ value: 20 });
    const valid = target.write(25);
    clock.advanceBy(0);
    await valid.result();
    expect(target.value.current()).toMatchObject({ value: 25 });
    const readOnly = await provider.resolve<number>("readOnly");
    const rejected = readOnly.write(2);
    clock.advanceBy(0);
    await expect(rejected.result()).rejects.toMatchObject({ code: "GGCS_PARAMETER_READ_ONLY" });
    await runtime.stop();
  });
});
