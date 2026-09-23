import type { Runtime, RuntimeResource, RuntimeState } from "@ggcs/core";
import { compileSensorSuiteApplication } from "@ggcs/sensor-suite";
import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
  type CompatibilityBinding,
} from "./compatibility-map";

export interface SensorSuiteRuntimeLike {
  state(): RuntimeState;
  start(): Promise<void>;
  stop(): Promise<void>;
  resource<T extends RuntimeResource = RuntimeResource>(id: string): T;
}

/**
 * Temporary M05 migration access for the still-unextracted React widgets.
 * It is deliberately narrower than Runtime and contains no legacy backend mode.
 */
export interface SensorSuiteCompatibilityAccess {
  runtimeState(): RuntimeState;
  resolvePort(instanceId: string, portName: string): CompatibilityBinding | undefined;
  resolveCapability(instanceId: string, capabilityName: string): CompatibilityBinding | undefined;
  resourceForPort<T extends RuntimeResource = RuntimeResource>(
    instanceId: string,
    portName: string,
  ): T | undefined;
  resourceForCapability<T extends RuntimeResource = RuntimeResource>(
    instanceId: string,
    capabilityName: string,
  ): T | undefined;
}

export interface SensorSuiteWebApplication {
  readonly compatibility: SensorSuiteCompatibilityAccess;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateSensorSuiteWebApplicationOptions {
  readonly rosbridgeUrl: string;
}

interface CreateSensorSuiteWebApplicationDependencies {
  readonly createRuntime?: (options: CreateSensorSuiteWebApplicationOptions) => SensorSuiteRuntimeLike;
}

function productionRuntime(options: CreateSensorSuiteWebApplicationOptions): Runtime {
  return compileSensorSuiteApplication({
    rosbridgeUrl: options.rosbridgeUrl,
    // M04 proved the active Web presentation including the ZED RGB path.
    includeCamera: true,
  }).createRuntime();
}

export function createSensorSuiteWebApplication(
  options: CreateSensorSuiteWebApplicationOptions,
  dependencies: CreateSensorSuiteWebApplicationDependencies = {},
): SensorSuiteWebApplication {
  let runtime: SensorSuiteRuntimeLike | undefined;
  let started = false;
  let stopped = false;

  function resourceForBinding<T extends RuntimeResource>(binding: CompatibilityBinding | undefined): T | undefined {
    if (!binding || !runtime || runtime.state() !== "running") return undefined;
    return runtime.resource<T>(binding.resourceId);
  }

  const compatibility: SensorSuiteCompatibilityAccess = {
    runtimeState: () => runtime?.state() ?? "created",
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
      resourceForBinding<T>(resolveCompatibilityBinding(instanceId, portName)),
    resourceForCapability: <T extends RuntimeResource>(instanceId: string, capabilityName: string) =>
      resourceForBinding<T>(resolveCompatibilityCapability(instanceId, capabilityName)),
  };

  return {
    compatibility,
    async start() {
      if (stopped) throw new Error("Sensor Suite Web application cannot restart after stop");
      if (started) return;
      runtime ??= (dependencies.createRuntime ?? productionRuntime)(options);
      await runtime.start();
      started = true;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (runtime) await runtime.stop();
    },
  };
}
