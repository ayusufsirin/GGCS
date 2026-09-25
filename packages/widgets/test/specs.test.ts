import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import {
  STANDARD_WIDGET_IDS,
  STANDARD_WIDGET_SPECS,
  WIDGET_CAPABILITY_IDS,
  WIDGET_TYPE_IDS,
  actuatorWidgetSpec,
  gaugeWidgetSpec,
  imageWidgetSpec,
  parameterBrowserWidgetSpec,
  procedureActionWidgetSpec,
  statusWidgetSpec,
  validateWidgetSpec,
} from "../src/index.js";

describe("standard semantic WidgetSpecs", () => {
  it("registers the M05 initial standard set with unique namespaced IDs", () => {
    expect(STANDARD_WIDGET_SPECS.map((spec) => spec.type)).toEqual(Object.values(STANDARD_WIDGET_IDS));
    expect(new Set(STANDARD_WIDGET_SPECS.map((spec) => spec.type)).size).toBe(STANDARD_WIDGET_SPECS.length);
    for (const spec of STANDARD_WIDGET_SPECS) expect(validateWidgetSpec(spec)).toEqual([]);
  });

  it("models gauge as one required numeric observation plus semantic props", () => {
    expect(gaugeWidgetSpec.inputs.value).toEqual({ type: CORE_TYPE_IDS.number, required: true });
    expect(gaugeWidgetSpec.props).toHaveProperty("thresholds");
    expect(gaugeWidgetSpec.props).not.toHaveProperty("needleColor");
    expect(gaugeWidgetSpec.props).not.toHaveProperty("segments");
  });

  it("models status without React icon/color objects", () => {
    expect(statusWidgetSpec.inputs.value.type).toBe(WIDGET_TYPE_IDS.statusValue);
    expect(statusWidgetSpec.props.icon.type).toBe(WIDGET_TYPE_IDS.iconId);
    expect(statusWidgetSpec.props).not.toHaveProperty("onColor");
    expect(statusWidgetSpec.props).not.toHaveProperty("offColor");
  });

  it("models procedure action and actuator with semantic action targets", () => {
    expect(procedureActionWidgetSpec.actions.trigger.target).toBe("procedure");
    expect(actuatorWidgetSpec.actions.target).toEqual({
      target: "command",
      input: CORE_TYPE_IDS.number,
      required: true,
    });
  });

  it("models parameter browser as a ParameterProvider capability", () => {
    expect(parameterBrowserWidgetSpec.capabilities.parameters).toEqual({
      capability: WIDGET_CAPABILITY_IDS.parameterProvider,
      required: true,
    });
    expect(parameterBrowserWidgetSpec.actions).toEqual({});
  });

  it("models image input as ImageFrame rather than a data-uri prop", () => {
    expect(imageWidgetSpec.inputs.frame).toEqual({ type: WIDGET_TYPE_IDS.imageFrame, required: true });
    expect(imageWidgetSpec.props).not.toHaveProperty("src");
  });
});
