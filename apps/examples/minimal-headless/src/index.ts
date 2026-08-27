import {
  DERIVED_PROVIDER_ID,
  compileApplication,
  createRegistryBuilder,
  type Command,
  type ComputationInstance,
  type Observation,
  type ParameterProvider,
  type Procedure,
  type Source,
} from "@ggcs/core";
import { defineComputation, definePlugin, defineType } from "@ggcs/plugin-sdk";
import { CORE_TYPE_IDS, GGCS_SCHEMA_VERSION } from "@ggcs/schema";
import {
  FakeClock,
  TEST_PROVIDER_IDS,
  TestSource,
  createTestingPlugin,
} from "@ggcs/testing";

interface ThermalHealth {
  readonly severity: "ok" | "warning" | "error";
  readonly summary: string;
}

const thermalHealthType = defineType<ThermalHealth>({
  id: "example:type/thermal-health",
  schema: {
    type: "object",
    required: ["severity", "summary"],
    additionalProperties: false,
    properties: {
      severity: { enum: ["ok", "warning", "error"] },
      summary: { type: "string" },
    },
  },
});

const thermalHealth = defineComputation<ThermalHealth>({
  id: "example:thermal-health",
  inputs: {
    temperature: CORE_TYPE_IDS.number,
    humidity: CORE_TYPE_IDS.number,
  },
  output: thermalHealthType.id,
  create(): ComputationInstance<ThermalHealth> {
    return {
      compute({ inputs, clock }): Observation<ThermalHealth> {
        const temperature = inputs.temperature;
        const humidity = inputs.humidity;
        if (temperature?.state !== "fresh" || humidity?.state !== "fresh") {
          return {
            state: "fresh",
            value: { severity: "error", summary: "telemetry unavailable or stale" },
            updatedAt: clock.wallNow(),
          };
        }
        const temp = temperature.value as number;
        const rh = humidity.value as number;
        const severity = temp >= 30 || rh >= 75 ? "warning" : "ok";
        return {
          state: "fresh",
          value: { severity, summary: `${temp}C / ${rh}% RH` },
          updatedAt: clock.wallNow(),
        };
      },
    };
  },
});

const examplePlugin = definePlugin({
  manifest: {
    id: "example:thermal",
    version: "0.1.0",
    ggcsApi: "^0.1.0",
  },
  types: [thermalHealthType],
  computations: [thermalHealth],
});

const testing = createTestingPlugin();
const registry = createRegistryBuilder()
  .register(testing.plugin)
  .register(examplePlugin);

const compiled = compileApplication(
  {
    schemaVersion: GGCS_SCHEMA_VERSION,
    plugins: ["testing:plugin", "example:thermal"],
    resources: [
      {
        id: "environment.temperature",
        provider: TEST_PROVIDER_IDS.source,
        type: CORE_TYPE_IDS.number,
        config: { initial: 22, staleAfterMs: 1_000 },
      },
      {
        id: "environment.humidity",
        provider: TEST_PROVIDER_IDS.source,
        type: CORE_TYPE_IDS.number,
        config: { initial: 45, staleAfterMs: 1_000 },
      },
      {
        id: "fan.rpm",
        provider: TEST_PROVIDER_IDS.source,
        type: CORE_TYPE_IDS.number,
        config: { initial: 900 },
      },
      {
        id: "fan.enabled",
        provider: TEST_PROVIDER_IDS.command,
        type: CORE_TYPE_IDS.boolean,
      },
      {
        id: "system.calibrate",
        provider: TEST_PROVIDER_IDS.procedure,
        type: CORE_TYPE_IDS.object,
        config: { result: { ok: true }, delayMs: 25, timeoutMs: 250 },
      },
      {
        id: "settings.parameters",
        provider: TEST_PROVIDER_IDS.parameterProvider,
        type: CORE_TYPE_IDS.object,
        config: {
          parameters: [
            {
              id: "settings.targetTemperature",
              type: CORE_TYPE_IDS.number,
              writable: true,
              initial: 23,
              defaultValue: 23,
              minimum: 10,
              maximum: 35,
              unit: "C",
            },
          ],
        },
      },
      {
        id: "thermal.health",
        provider: DERIVED_PROVIDER_ID,
        type: thermalHealthType.id,
        config: {
          computation: thermalHealth.id,
          inputs: {
            temperature: "environment.temperature",
            humidity: "environment.humidity",
          },
        },
      },
    ],
  },
  registry,
);

const clock = new FakeClock();
const runtime = compiled.createRuntime({ clock });
await runtime.start();

const temperature = runtime.resource<TestSource<number>>("environment.temperature");
const health = runtime.resource<Source<ThermalHealth>>("thermal.health");
const fanEnabled = runtime.resource<Command<boolean>>("fan.enabled");
const calibrate = runtime.resource<Procedure<Record<string, never>, { ok: boolean }>>("system.calibrate");
const parameters = runtime.resource<ParameterProvider>("settings.parameters");

await fanEnabled.send(true);
temperature.emit(31);
const calibration = calibrate.invoke({});
clock.advanceBy(25);
await calibration.result();

const target = await parameters.resolve<number>("settings.targetTemperature");
const write = target.write(24);
clock.advanceBy(0);
await write.result();

const output = {
  runtime: runtime.state(),
  health: health.current(),
  targetTemperature: target.value.current(),
  lifecycleEvents: testing.events,
};

const logger = (globalThis as unknown as { console?: { log(value: string): void } }).console;
logger?.log(JSON.stringify(output, null, 2));

await runtime.stop();
