import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import { assertValidWidgetSpec, validateWidgetSpec } from "../src/index.js";

describe("WidgetSpec validation", () => {
  it("rejects non-namespaced IDs and invalid versions", () => {
    const issues = validateWidgetSpec({
      type: "gauge",
      version: 0,
      props: {},
      inputs: {},
      actions: {},
      capabilities: {},
    });
    expect(issues.map((issue) => issue.path)).toContain("$.type");
    expect(issues.map((issue) => issue.path)).toContain("$.version");
  });

  it("keeps command and procedure action contracts distinct", () => {
    const issues = validateWidgetSpec({
      type: "ggcs:test",
      version: 1,
      props: {},
      inputs: {},
      actions: {
        commandWithOutput: { target: "command", input: CORE_TYPE_IDS.number, output: CORE_TYPE_IDS.number },
        procedureWithoutOutput: { target: "procedure", input: CORE_TYPE_IDS.number },
      },
      capabilities: {},
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.actions.commandWithOutput.output" }),
      expect.objectContaining({ path: "$.actions.procedureWithoutOutput.output" }),
    ]));
  });

  it("rejects unknown fields because the core WidgetSpec surface is strict", () => {
    const issues = validateWidgetSpec({
      type: "ggcs:test",
      version: 1,
      props: { label: { type: CORE_TYPE_IDS.string, reactComponent: "nope" } },
      inputs: {},
      actions: {},
      capabilities: {},
      component: "ReactWidget",
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.component" }),
      expect.objectContaining({ path: "$.props.label.reactComponent" }),
    ]));
  });

  it("rejects duplicate renderer capability IDs", () => {
    const issues = validateWidgetSpec({
      type: "ggcs:test",
      version: 1,
      props: {},
      inputs: {},
      actions: {},
      capabilities: {},
      rendererCapabilities: ["ggcs:renderer/rich-image", "ggcs:renderer/rich-image"],
    });
    expect(issues).toContainEqual({
      path: "$.rendererCapabilities[1]",
      message: "must not duplicate a renderer capability ID",
    });
  });

  it("rejects non-finite numbers because portable defaults must be JSON", () => {
    const issues = validateWidgetSpec({
      type: "ggcs:test",
      version: 1,
      props: { value: { type: CORE_TYPE_IDS.number, defaultValue: Number.NaN } },
      inputs: {},
      actions: {},
      capabilities: {},
    });
    expect(issues).toContainEqual({
      path: "$.props.value.defaultValue",
      message: "must be portable JSON data",
    });
  });

  it("rejects executable/non-portable property defaults", () => {
    const issues = validateWidgetSpec({
      type: "ggcs:test",
      version: 1,
      props: { label: { type: CORE_TYPE_IDS.string, defaultValue: () => "bad" } },
      inputs: {},
      actions: {},
      capabilities: {},
    });
    expect(issues).toContainEqual({
      path: "$.props.label.defaultValue",
      message: "must be portable JSON data",
    });
  });

  it("assert helper reports deterministic paths", () => {
    expect(() => assertValidWidgetSpec({ type: "bad" })).toThrow(/\$\.version/);
  });
});
