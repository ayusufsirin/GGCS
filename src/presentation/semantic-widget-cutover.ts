import type { RuntimeResource, Source } from "@ggcs/core";
import type {
  PresentationAccess,
  ResolvedWidgetAccess,
} from "@ggcs/renderer-react";
import {
  gaugeWidgetSpec,
  statusWidgetSpec,
  type ResolvedWidgetInstance,
} from "@ggcs/widgets";
import type { SensorSuiteCompatibilityAccess } from "../runtime/sensor-suite-application";

type SemanticLegacyWidgetName = "gauge" | "status";

interface SemanticWidgetCutoverDefinition {
  readonly legacyWidgetName: SemanticLegacyWidgetName;
  readonly instance: ResolvedWidgetInstance;
  readonly inputAliases: Readonly<Record<string, string>>;
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

/**
 * Temporary app-local bridge from the already-proven Runtime compatibility map
 * into the narrow semantic PresentationAccess required by @ggcs/renderer-react.
 * No ROS names or renderer implementation objects are introduced here.
 */
export function createSensorSuiteSemanticPresentationAccess(
  compatibility: SensorSuiteCompatibilityAccess,
): PresentationAccess {
  return {
    widget(instanceId) {
      const definition = DEFINITION_BY_ID.get(instanceId);
      if (!definition) return undefined;

      const access: ResolvedWidgetAccess = {
        input<T, Q>(port: string) {
          const legacyPort = definition.inputAliases[port];
          return legacyPort
            ? sourceResource<T, Q>(compatibility, definition.instance.id, legacyPort)
            : undefined;
        },
        command: () => undefined,
        procedure: () => undefined,
        capability: () => undefined,
      };
      return access;
    },
  };
}
