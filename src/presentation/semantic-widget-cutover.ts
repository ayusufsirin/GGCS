import type {
  LastGoodObservation,
  Observation,
  ParameterProvider,
  Procedure,
  RuntimeResource,
  Source,
} from "@ggcs/core";
import type {
  PresentationAccess,
  ResolvedWidgetAccess,
} from "@ggcs/renderer-react";
import {
  gaugeWidgetSpec,
  imageWidgetSpec,
  parameterBrowserWidgetSpec,
  procedureActionWidgetSpec,
  statusWidgetSpec,
  type ImageFrame,
  type ResolvedWidgetInstance,
} from "@ggcs/widgets";
import { SENSOR_SUITE_RECORDING_REQUESTS } from "../application/recording-actions";
import type { SensorSuiteCompatibilityAccess } from "../runtime/sensor-suite-application";

type SemanticLegacyWidgetName = "gauge" | "status" | "service" | "image" | "rosParameters";

type InputTransform = Readonly<{
  kind: "base64-image-frame";
  mimeType: string;
  provenance?: string;
}>;

interface SemanticWidgetCutoverDefinition {
  readonly legacyWidgetName: SemanticLegacyWidgetName;
  readonly instance: ResolvedWidgetInstance;
  readonly inputAliases?: Readonly<Record<string, string>>;
  readonly inputTransforms?: Readonly<Record<string, InputTransform>>;
  readonly procedureBindings?: Readonly<Record<string, Readonly<{
    legacyPort: string;
    input: unknown;
  }>>>;
  readonly capabilityAliases?: Readonly<Record<string, string>>;
}

function booleanStatus(
  instanceId: string,
  label: string,
  hint: string,
  icon: string,
  trueLabel = "OK",
  falseLabel = "ERR",
): SemanticWidgetCutoverDefinition {
  return {
    legacyWidgetName: "status",
    instance: {
      id: instanceId,
      spec: statusWidgetSpec,
      props: {
        label,
        hint,
        icon,
        states: [
          { value: true, label: trueLabel, severity: "ok", icon },
          { value: false, label: falseLabel, severity: "error", icon },
        ],
      },
    },
    inputAliases: { value: "status" },
  };
}

function procedureAction(
  instanceId: string,
  label: string,
  pendingLabel: string,
  input: unknown,
): SemanticWidgetCutoverDefinition {
  return {
    legacyWidgetName: "service",
    instance: {
      id: instanceId,
      spec: procedureActionWidgetSpec,
      props: { label, pendingLabel },
    },
    procedureBindings: {
      trigger: { legacyPort: "callService", input },
    },
  };
}

const DEFINITIONS: readonly SemanticWidgetCutoverDefinition[] = [
  {
    legacyWidgetName: "status",
    instance: {
      id: "tabs.items.home.grids.items.gpsStatus",
      spec: statusWidgetSpec,
      props: {
        label: "GPS Satellites",
        unit: "sat",
        precision: 0,
        icon: "satellite",
        hint: "Locked satellites",
        thresholds: [
          { min: 0, severity: "error" },
          { min: 4, severity: "warning" },
          { min: 8, severity: "ok" },
        ],
      },
    },
    inputAliases: { value: "gpsSatellites" },
  },
  booleanStatus(
    "tabs.items.home.grids.items.rtkSystemStatus",
    "System",
    "System OK",
    "power",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkRollPitchStatus",
    "Roll/Pitch",
    "Roll/Pitch OK",
    "attitude",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkYawStatus",
    "Yaw",
    "Yaw OK",
    "heading",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkPosVelStatus",
    "Position/Velocity",
    "Pos/Vel OK",
    "position",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkMagStatus",
    "Magnetometer",
    "Mag OK",
    "magnetometer",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkGnssStatus",
    "GNSS",
    "GNSS Fixed",
    "gnss",
    "Fixed",
    "No Fix",
  ),
  booleanStatus(
    "tabs.items.home.grids.items.rtkRtkStatus",
    "RTK",
    "RTK Fixed",
    "rtk",
    "Fixed",
    "Floating",
  ),
  {
    legacyWidgetName: "gauge",
    instance: {
      id: "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      spec: gaugeWidgetSpec,
      props: {
        label: "Speed",
        unit: "m/s",
        min: 0,
        max: 10,
        precision: 2,
        thresholds: [
          { min: 0, severity: "info" },
          { min: 3, severity: "warning" },
          { min: 7, severity: "error" },
        ],
      },
    },
    inputAliases: { value: "value" },
  },
  {
    legacyWidgetName: "gauge",
    instance: {
      id: "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.accel",
      spec: gaugeWidgetSpec,
      props: {
        label: "Acceleration",
        unit: "m/s²",
        precision: 2,
      },
    },
    inputAliases: { value: "value" },
  },
  procedureAction(
    "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
    "Start SVO",
    "Starting",
    SENSOR_SUITE_RECORDING_REQUESTS.zedStart,
  ),
  procedureAction(
    "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo",
    "Stop SVO",
    "Stopping",
    SENSOR_SUITE_RECORDING_REQUESTS.zedStop,
  ),
  procedureAction(
    "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
    "Start ROS Bag",
    "Starting",
    SENSOR_SUITE_RECORDING_REQUESTS.bagStart,
  ),
  procedureAction(
    "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
    "Stop ROS Bag",
    "Stopping",
    SENSOR_SUITE_RECORDING_REQUESTS.bagStop,
  ),
  {
    legacyWidgetName: "image",
    instance: {
      id: "tabs.items.images.grids.items.zedRgb",
      spec: imageWidgetSpec,
      props: { label: "ZED RGB Image" },
    },
    inputAliases: { frame: "image" },
    inputTransforms: {
      frame: {
        kind: "base64-image-frame",
        mimeType: "image/png",
        provenance: "camera.zed.rgb.data",
      },
    },
  },
  {
    legacyWidgetName: "rosParameters",
    instance: {
      id: "tabs.items.rosParameters",
      spec: parameterBrowserWidgetSpec,
      props: { title: "ROS Parameters", allowWrite: true },
    },
    capabilityAliases: { parameters: "parameters" },
  },
];

const DEFINITION_BY_ID = new Map(
  DEFINITIONS.map((definition) => [definition.instance.id, definition] as const),
);

export const SENSOR_SUITE_SEMANTIC_WIDGET_INSTANCE_IDS = Object.freeze(
  DEFINITIONS.map((definition) => definition.instance.id),
);

export function resolveSensorSuiteSemanticWidget(
  instanceId: string,
  legacyWidgetName: string,
): ResolvedWidgetInstance | undefined {
  const definition = DEFINITION_BY_ID.get(instanceId);
  if (!definition || definition.legacyWidgetName !== legacyWidgetName) return undefined;
  return definition.instance;
}

function sourceResource<T, Q>(
  compatibility: SensorSuiteCompatibilityAccess,
  instanceId: string,
  legacyPort: string,
): Source<T, Q> | undefined {
  const binding = compatibility.resolvePort(instanceId, legacyPort);
  if (binding?.kind !== "source") return undefined;
  const resource = compatibility.resourceForPort<RuntimeResource>(instanceId, legacyPort);
  return resource?.kind === "source" ? resource as Source<T, Q> : undefined;
}

function procedureResource<I, O>(
  compatibility: SensorSuiteCompatibilityAccess,
  instanceId: string,
  legacyPort: string,
): Procedure<I, O> | undefined {
  const binding = compatibility.resolvePort(instanceId, legacyPort);
  if (binding?.kind !== "procedure") return undefined;
  const resource = compatibility.resourceForPort<RuntimeResource>(instanceId, legacyPort);
  return resource?.kind === "procedure" ? resource as Procedure<I, O> : undefined;
}

function parameterProviderResource(
  compatibility: SensorSuiteCompatibilityAccess,
  instanceId: string,
  legacyCapability: string,
): ParameterProvider | undefined {
  const binding = compatibility.resolveCapability(instanceId, legacyCapability);
  if (binding?.kind !== "parameterProvider") return undefined;
  const resource = compatibility.resourceForCapability<RuntimeResource>(instanceId, legacyCapability);
  return resource?.kind === "parameter_provider" ? resource as ParameterProvider : undefined;
}

function mapLastGood<T, U, Q>(
  observation: LastGoodObservation<T, Q>,
  project: (value: T) => U,
): LastGoodObservation<U, Q> {
  if (observation.state === "fresh") {
    return { ...observation, value: project(observation.value) };
  }
  return { ...observation, value: project(observation.value) };
}

function mapObservation<T, U, Q>(
  observation: Observation<T, Q>,
  project: (value: T) => U,
): Observation<U, Q> {
  switch (observation.state) {
    case "fresh":
      return { ...observation, value: project(observation.value) };
    case "stale":
      return { ...observation, value: project(observation.value) };
    case "error": {
      if (!observation.lastGood) {
        return {
          state: "error",
          error: observation.error,
          occurredAt: observation.occurredAt,
        };
      }
      const lastGood = mapLastGood(observation.lastGood, project);
      return {
        state: "error",
        error: observation.error,
        occurredAt: observation.occurredAt,
        lastGood,
      };
    }
    case "unavailable":
      return observation;
  }
}

function projectSource<T, U, Q>(
  source: Source<T, Q>,
  project: (value: T) => U,
): Source<U, Q> {
  return {
    kind: "source",
    id: source.id,
    current: () => mapObservation(source.current(), project),
    subscribe(listener) {
      return source.subscribe((observation) => listener(mapObservation(observation, project)));
    },
  };
}

function imageFrameProjector(transform: InputTransform): (payload: string) => ImageFrame {
  return (payload) => ({
    payload,
    mimeType: transform.mimeType,
    encoding: "base64",
    ...(transform.provenance ? { provenance: transform.provenance } : {}),
  });
}

function bindProcedureInput<I, O>(procedure: Procedure<I, O>, input: I): Procedure<void, O> {
  return {
    kind: "procedure",
    id: procedure.id,
    invoke: () => procedure.invoke(input),
  };
}

/**
 * Temporary app-local bridge from the already-proven Runtime compatibility map
 * into the narrow semantic PresentationAccess required by @ggcs/renderer-react.
 * No ROS names or renderer implementation objects are introduced here.
 */
export function createSensorSuiteSemanticPresentationAccess(
  compatibility: SensorSuiteCompatibilityAccess,
): PresentationAccess {
  const cache = new Map<string, ResolvedWidgetAccess | undefined>();

  return {
    widget(instanceId) {
      if (cache.has(instanceId)) return cache.get(instanceId);
      const definition = DEFINITION_BY_ID.get(instanceId);
      if (!definition) {
        cache.set(instanceId, undefined);
        return undefined;
      }

      const inputCache = new Map<string, Source<unknown, unknown> | undefined>();
      const procedureCache = new Map<string, Procedure<void, unknown> | undefined>();
      const capabilityCache = new Map<string, RuntimeResource | undefined>();
      const access: ResolvedWidgetAccess = {
        input<T, Q>(port: string) {
          if (inputCache.has(port)) {
            return inputCache.get(port) as Source<T, Q> | undefined;
          }
          const legacyPort = definition.inputAliases?.[port];
          if (!legacyPort) return undefined;
          const source = sourceResource<unknown, unknown>(compatibility, definition.instance.id, legacyPort);
          if (!source) {
            inputCache.set(port, undefined);
            return undefined;
          }
          const transform = definition.inputTransforms?.[port];
          const resolved = transform?.kind === "base64-image-frame"
            ? projectSource(source as Source<string, unknown>, imageFrameProjector(transform))
            : source;
          inputCache.set(port, resolved as Source<unknown, unknown>);
          return resolved as Source<T, Q>;
        },
        command: () => undefined,
        procedure<I, O>(port: string) {
          if (procedureCache.has(port)) {
            return procedureCache.get(port) as Procedure<I, O> | undefined;
          }
          const binding = definition.procedureBindings?.[port];
          if (!binding) return undefined;
          const procedure = procedureResource<unknown, unknown>(
            compatibility,
            definition.instance.id,
            binding.legacyPort,
          );
          if (!procedure) {
            procedureCache.set(port, undefined);
            return undefined;
          }
          const resolved = bindProcedureInput(procedure, binding.input);
          procedureCache.set(port, resolved);
          return resolved as unknown as Procedure<I, O>;
        },
        capability<T extends RuntimeResource>(port: string) {
          if (capabilityCache.has(port)) {
            return capabilityCache.get(port) as T | undefined;
          }
          const legacyCapability = definition.capabilityAliases?.[port];
          if (!legacyCapability) return undefined;
          const resolved = parameterProviderResource(compatibility, definition.instance.id, legacyCapability);
          capabilityCache.set(port, resolved);
          return resolved as T | undefined;
        },
      };
      cache.set(instanceId, access);
      return access;
    },
  };
}
