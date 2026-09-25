import { CORE_TYPE_IDS, type WidgetTypeId } from "@ggcs/schema";
import {
  STANDARD_WIDGET_IDS,
  WIDGET_CAPABILITY_IDS,
  type WidgetSpec,
} from "./contracts.js";
import { WIDGET_TYPE_IDS } from "./value-models.js";

const empty = Object.freeze({}) as Readonly<Record<string, never>>;

export const gaugeWidgetSpec = {
  type: STANDARD_WIDGET_IDS.gauge,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string },
    unit: { type: CORE_TYPE_IDS.string },
    min: { type: CORE_TYPE_IDS.number },
    max: { type: CORE_TYPE_IDS.number },
    precision: { type: CORE_TYPE_IDS.number, defaultValue: 0 },
    thresholds: { type: WIDGET_TYPE_IDS.semanticThresholds },
  },
  inputs: {
    value: { type: CORE_TYPE_IDS.number, required: true },
  },
  actions: empty,
  capabilities: empty,
} as const satisfies WidgetSpec;

export const statusWidgetSpec = {
  type: STANDARD_WIDGET_IDS.status,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string, required: true },
    unit: { type: CORE_TYPE_IDS.string },
    precision: { type: CORE_TYPE_IDS.number },
    states: { type: WIDGET_TYPE_IDS.statusStateMappings },
    thresholds: { type: WIDGET_TYPE_IDS.semanticThresholds },
    icon: { type: WIDGET_TYPE_IDS.iconId },
    hint: { type: CORE_TYPE_IDS.string },
  },
  inputs: {
    value: { type: WIDGET_TYPE_IDS.statusValue, required: true },
  },
  actions: empty,
  capabilities: empty,
} as const satisfies WidgetSpec;

export const attitudeWidgetSpec = {
  type: STANDARD_WIDGET_IDS.attitude,
  version: 1,
  props: empty,
  inputs: {
    rollDeg: { type: CORE_TYPE_IDS.number, required: true },
    pitchDeg: { type: CORE_TYPE_IDS.number, required: true },
    headingDeg: { type: CORE_TYPE_IDS.number },
    speed: { type: CORE_TYPE_IDS.number },
    altitude: { type: CORE_TYPE_IDS.number },
  },
  actions: empty,
  capabilities: empty,
} as const satisfies WidgetSpec;

export const navigationMapWidgetSpec = {
  type: STANDARD_WIDGET_IDS.navigationMap,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string },
  },
  inputs: {
    position: { type: WIDGET_TYPE_IDS.geoPosition, required: true },
    heading: { type: CORE_TYPE_IDS.number },
    home: { type: WIDGET_TYPE_IDS.geoPosition },
    waypoints: { type: WIDGET_TYPE_IDS.waypointList },
    trail: { type: WIDGET_TYPE_IDS.geoPositionList },
  },
  actions: empty,
  capabilities: empty,
} as const satisfies WidgetSpec;

export const procedureActionWidgetSpec = {
  type: STANDARD_WIDGET_IDS.procedureAction,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string, required: true },
    pendingLabel: { type: CORE_TYPE_IDS.string },
  },
  inputs: empty,
  actions: {
    trigger: {
      target: "procedure",
      input: CORE_TYPE_IDS.unknown,
      output: CORE_TYPE_IDS.unknown,
      required: true,
    },
  },
  capabilities: empty,
} as const satisfies WidgetSpec;

export const imageWidgetSpec = {
  type: STANDARD_WIDGET_IDS.image,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string },
  },
  inputs: {
    frame: { type: WIDGET_TYPE_IDS.imageFrame, required: true },
  },
  actions: empty,
  capabilities: empty,
} as const satisfies WidgetSpec;

export const parameterBrowserWidgetSpec = {
  type: STANDARD_WIDGET_IDS.parameterBrowser,
  version: 1,
  props: {
    title: { type: CORE_TYPE_IDS.string },
    allowWrite: { type: CORE_TYPE_IDS.boolean, defaultValue: true },
  },
  inputs: empty,
  actions: empty,
  capabilities: {
    parameters: {
      capability: WIDGET_CAPABILITY_IDS.parameterProvider,
      required: true,
    },
  },
} as const satisfies WidgetSpec;

export const actuatorWidgetSpec = {
  type: STANDARD_WIDGET_IDS.actuator,
  version: 1,
  props: {
    label: { type: CORE_TYPE_IDS.string },
    unit: { type: CORE_TYPE_IDS.string },
    min: { type: CORE_TYPE_IDS.number },
    max: { type: CORE_TYPE_IDS.number },
    step: { type: CORE_TYPE_IDS.number },
    precision: { type: CORE_TYPE_IDS.number },
  },
  inputs: {
    feedback: { type: CORE_TYPE_IDS.number },
  },
  actions: {
    target: {
      target: "command",
      input: CORE_TYPE_IDS.number,
      required: true,
    },
  },
  capabilities: empty,
} as const satisfies WidgetSpec;

export const STANDARD_WIDGET_SPECS = [
  gaugeWidgetSpec,
  statusWidgetSpec,
  attitudeWidgetSpec,
  navigationMapWidgetSpec,
  procedureActionWidgetSpec,
  imageWidgetSpec,
  parameterBrowserWidgetSpec,
  actuatorWidgetSpec,
] as const satisfies readonly WidgetSpec[];

export const STANDARD_WIDGET_SPEC_BY_ID: Readonly<Record<WidgetTypeId, WidgetSpec>> =
  Object.freeze(Object.fromEntries(STANDARD_WIDGET_SPECS.map((spec) => [spec.type, spec])));
