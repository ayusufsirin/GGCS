import type { Runtime, RuntimeResource, RuntimeState } from "@ggcs/core";
import { compileSensorSuiteApplication } from "@ggcs/sensor-suite";
import {
  assertM04Slice4ModeSupported,
  backendStartsRuntime,
  type SensorSuiteBackendMode,
} from "./backend-mode";
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

export interface SensorSuiteCompatibilityAccess {
  readonly mode: SensorSuiteBackendMode;
  readonly runtimeEnabled: boolean;
  runtimeState(): RuntimeState | "disabled";
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
  readonly mode: SensorSuiteBackendMode;
  readonly compatibility: SensorSuiteCompatibilityAccess;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateSensorSuiteWebApplicationOptions {
  readonly mode: SensorSuiteBackendMode;
  readonly rosbridgeUrl: string;
  readonly includeCamera?: boolean;
}

interface CreateSensorSuiteWebApplicationDependencies {
  readonly createRuntime?: (options: CreateSensorSuiteWebApplicationOptions) => SensorSuiteRuntimeLike;
}

function productionRuntime(options: CreateSensorSuiteWebApplicationOptions): Runtime {
  return compileSensorSuiteApplication({
    rosbridgeUrl: options.rosbridgeUrl,
    ...(options.includeCamera !== undefined ? { includeCamera: options.includeCamera } : {}),
  }).createRuntime();
}

export function createSensorSuiteWebApplication(
  options: CreateSensorSuiteWebApplicationOptions,
  dependencies: CreateSensorSuiteWebApplicationDependencies = {},
): SensorSuiteWebApplication {
  assertM04Slice4ModeSupported(options.mode);

  const runtimeEnabled = backendStartsRuntime(options.mode);
  let runtime: SensorSuiteRuntimeLike | undefined;

  let started = false;
  let stopped = false;

  function resourceForBinding<T extends RuntimeResource>(binding: CompatibilityBinding | undefined): T | undefined {
    if (!binding || !runtime || runtime.state() !== "running") return undefined;
    return runtime.resource<T>(binding.resourceId);
  }

  const compatibility: SensorSuiteCompatibilityAccess = {
    mode: options.mode,
    runtimeEnabled,
    runtimeState: () => runtime?.state() ?? "disabled",
    resolvePort: resolveCompatibilityBinding,
    resolveCapability: resolveCompatibilityCapability,
    resourceForPort: <T extends RuntimeResource>(instanceId: string, portName: string) =>
      resourceForBinding<T>(resolveCompatibilityBinding(instanceId, portName)),
    resourceForCapability: <T extends RuntimeResource>(instanceId: string, capabilityName: string) =>
      resourceForBinding<T>(resolveCompatibilityCapability(instanceId, capabilityName)),
  };

  return {
    mode: options.mode,
    compatibility,
    async start() {
      if (stopped) throw new Error("Sensor Suite Web application cannot restart after stop");
      if (started) return;
      if (runtimeEnabled) {
        runtime ??= (dependencies.createRuntime ?? productionRuntime)(options);
        await runtime.start();
      }
      started = true;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (runtime) await runtime.stop();
    },
  };
}
