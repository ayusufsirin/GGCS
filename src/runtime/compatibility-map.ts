import { SENSOR_SUITE_RESOURCE_IDS } from "@ggcs/sensor-suite";

export type CompatibilityBindingKind = "source" | "procedure" | "parameterProvider";

export interface CompatibilityBinding {
  readonly kind: CompatibilityBindingKind;
  readonly resourceId: string;
}

export interface CompatibilityWidgetBinding {
  readonly ports: Readonly<Record<string, CompatibilityBinding>>;
  readonly capabilities?: Readonly<Record<string, CompatibilityBinding>>;
}

export type CompatibilityBindingMap = Readonly<Record<string, CompatibilityWidgetBinding>>;

const source = (resourceId: string): CompatibilityBinding => ({ kind: "source", resourceId });
const procedure = (resourceId: string): CompatibilityBinding => ({ kind: "procedure", resourceId });
const parameterProvider = (resourceId: string): CompatibilityBinding => ({ kind: "parameterProvider", resourceId });

/**
 * Temporary migration artifact. This is deliberately explicit and semantic:
 * no ROS topic/service names live here and no runtime discovery scans config.
 */
export const SENSOR_SUITE_COMPATIBILITY_BINDINGS: CompatibilityBindingMap = {
  "tabs.items.home.grids.items.hud": {
    ports: {
      roll: source(SENSOR_SUITE_RESOURCE_IDS.navRollDeg),
      pitch: source(SENSOR_SUITE_RESOURCE_IDS.navPitchDeg),
      heading: source(SENSOR_SUITE_RESOURCE_IDS.navHeadingDeg),
      speed: source(SENSOR_SUITE_RESOURCE_IDS.vehicleSpeed),
      altitude: source(SENSOR_SUITE_RESOURCE_IDS.navAltitudeM),
    },
  },
  "tabs.items.home.grids.items.map": {
    ports: {
      latitude: source(SENSOR_SUITE_RESOURCE_IDS.navLatitudeDeg),
      longitude: source(SENSOR_SUITE_RESOURCE_IDS.navLongitudeDeg),
      heading: source(SENSOR_SUITE_RESOURCE_IDS.navHeadingDeg),
    },
  },
  "tabs.items.home.grids.items.gpsStatus": {
    ports: { gpsSatellites: source(SENSOR_SUITE_RESOURCE_IDS.arnavSatellites) },
  },
  "tabs.items.home.grids.items.rtkSystemStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthSystem) },
  },
  "tabs.items.home.grids.items.rtkRollPitchStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthRollPitch) },
  },
  "tabs.items.home.grids.items.rtkYawStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthYaw) },
  },
  "tabs.items.home.grids.items.rtkPosVelStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthPositionVelocity) },
  },
  "tabs.items.home.grids.items.rtkMagStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthMagnetometer) },
  },
  "tabs.items.home.grids.items.rtkGnssStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.healthGnssFixed) },
  },
  "tabs.items.home.grids.items.rtkRtkStatus": {
    ports: { status: source(SENSOR_SUITE_RESOURCE_IDS.rtkFixedLegacy) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed": {
    ports: { value: source(SENSOR_SUITE_RESOURCE_IDS.vehicleSpeed) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.accel": {
    ports: { value: source(SENSOR_SUITE_RESOURCE_IDS.vehicleAcceleration) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo": {
    ports: { callService: procedure(SENSOR_SUITE_RESOURCE_IDS.zedRecordingStart) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo": {
    ports: { callService: procedure(SENSOR_SUITE_RESOURCE_IDS.zedRecordingStop) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord": {
    ports: { callService: procedure(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStart) },
  },
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord": {
    ports: { callService: procedure(SENSOR_SUITE_RESOURCE_IDS.bagRecordingStop) },
  },
  "tabs.items.rosParameters": {
    ports: {},
    capabilities: {
      parameters: parameterProvider(SENSOR_SUITE_RESOURCE_IDS.parameters),
    },
  },
};

/**
 * M04-S3 makes every explicitly mapped semantic Source port authoritative in
 * compat-read. Procedure and ParameterProvider bindings remain reserved for
 * later slices, and the camera is intentionally absent so its legacy
 * subscription can remain as the documented opt-in exception.
 */
export function isM04Slice3RuntimeReadPort(instanceId: string, portName: string): boolean {
  return resolveCompatibilityBinding(instanceId, portName)?.kind === "source";
}

const M04_SLICE4_RUNTIME_PROCEDURE_PORTS = new Set([
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord::callService",
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord::callService",
  "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo::callService",
]);

/**
 * M04-S4 migrates recording actions one at a time. Action 03 adds Stop SVO
 * after both ROS Bag actions were accepted; Start SVO stays legacy until its
 * own verified expansion step so its request/timestamp behavior remains isolated.
 */
export function isM04Slice4RuntimeProcedurePort(instanceId: string, portName: string): boolean {
  const binding = resolveCompatibilityBinding(instanceId, portName);
  return binding?.kind === "procedure" &&
    M04_SLICE4_RUNTIME_PROCEDURE_PORTS.has(`${instanceId}::${portName}`);
}

export function resolveCompatibilityBinding(
  instanceId: string,
  portName: string,
): CompatibilityBinding | undefined {
  return SENSOR_SUITE_COMPATIBILITY_BINDINGS[instanceId]?.ports[portName];
}

export function resolveCompatibilityCapability(
  instanceId: string,
  capabilityName: string,
): CompatibilityBinding | undefined {
  return SENSOR_SUITE_COMPATIBILITY_BINDINGS[instanceId]?.capabilities?.[capabilityName];
}
