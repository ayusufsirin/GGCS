import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "@ggcs/schema";
import type { WidgetSpec } from "@ggcs/widgets";
import {
  ReactWidgetRegistry,
  createReactRendererSession,
  type PresentationAccess,
  type ResolvedWidgetAccess,
} from "../src/index.js";
import type { ResolvedPresentation } from "@ggcs/widgets";

const spec = (type: string, version = 1): WidgetSpec => ({
  type,
  version,
  props: {},
  inputs: { value: { type: CORE_TYPE_IDS.number, required: true } },
  actions: {},
  capabilities: {},
});

const noopAccess: ResolvedWidgetAccess = {
  input: () => undefined,
  command: () => undefined,
  procedure: () => undefined,
  capability: () => undefined,
};
const presentationAccess: PresentationAccess = { widget: () => noopAccess };

const presentation: ResolvedPresentation = {
  id: "test:presentation",
  root: {
    kind: "widget",
    id: "root-widget",
    widget: { id: "widget-1", spec: spec("ggcs:test"), props: {} },
  },
};

function Exact() { return null; }
function Fallback() { return null; }
function Generic() { return null; }

describe("React widget registry", () => {
  it("resolves exact semantic type/version deterministically", () => {
    const registry = new ReactWidgetRegistry({
      implementations: [{ type: "ggcs:test", versions: [1], component: Exact, fallback: Fallback }],
      genericFallback: Generic,
    });
    expect(registry.resolve(presentation.root.kind === "widget" ? presentation.root.widget : (null as never))).toEqual({
      kind: "exact",
      component: Exact,
    });
    expect(registry.widgetTypes).toEqual(["ggcs:test"]);
  });

  it("uses a type fallback for unsupported semantic versions", () => {
    const registry = new ReactWidgetRegistry({
      implementations: [{ type: "ggcs:test", versions: [1], component: Exact, fallback: Fallback }],
      genericFallback: Generic,
    });
    expect(registry.resolve({ id: "widget-2", spec: spec("ggcs:test", 2), props: {} })).toEqual({
      kind: "fallback",
      component: Fallback,
    });
  });

  it("uses explicit unsupported representation when no implementation exists", () => {
    const registry = new ReactWidgetRegistry({ genericFallback: Generic });
    expect(registry.resolve({ id: "widget-3", spec: spec("ggcs:missing"), props: {} })).toEqual({
      kind: "unsupported",
      component: Generic,
    });
  });

  it("rejects duplicate semantic registrations", () => {
    expect(() => new ReactWidgetRegistry({
      implementations: [
        { type: "ggcs:test", component: Exact },
        { type: "ggcs:test", component: Fallback },
      ],
    })).toThrow(/Duplicate React widget implementation/);
  });
});

describe("React renderer session", () => {
  it("has renderer-local lifetime and stops idempotently without Runtime ownership", async () => {
    const registry = new ReactWidgetRegistry();
    const session = createReactRendererSession({ presentation, access: presentationAccess, registry });
    expect(session.state()).toBe("active");
    expect(Object.keys(session)).not.toContain("runtime");
    await session.stop();
    await session.stop();
    expect(session.state()).toBe("stopped");
  });
});
