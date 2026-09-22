import { config } from "../config";
import { collectBindings, isObject } from "../middleware/config-scan";
import { ValueTypes } from "../interfaces";
import { isM04Slice4RuntimeProcedurePort } from "./compatibility-map";
import { filterLegacyServiceBindingsForMode } from "./action-cutover";

interface ServiceRef {
  readonly instanceId: string;
  readonly attrName: string;
}

function collectServiceRefs(): ServiceRef[] {
  return collectBindings<ServiceRef>(
    config,
    (entry) => entry.type === ValueTypes.service && isObject(entry.service),
    ({ instanceId, attrName }) => ({ instanceId, attrName }),
  );
}

describe("M04-S4 Procedure/action cutover policy", () => {
  test("action 02 cuts over both ROS Bag Procedures and leaves SVO/rosapi services legacy", () => {
    const services = collectServiceRefs();
    const runtimeActions = services.filter((binding) =>
      isM04Slice4RuntimeProcedurePort(binding.instanceId, binding.attrName));
    const legacyServices = services.filter((binding) =>
      !isM04Slice4RuntimeProcedurePort(binding.instanceId, binding.attrName));

    expect(services).toHaveLength(8);
    expect(runtimeActions).toEqual([
      {
        instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
        attrName: "callService",
      },
      {
        instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
        attrName: "callService",
      },
    ]);
    expect(legacyServices).toHaveLength(6);
    expect(legacyServices).toContainEqual({
      instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
      attrName: "callService",
    });
    expect(legacyServices).toContainEqual({
      instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo",
      attrName: "callService",
    });
    expect(legacyServices.filter((binding) => binding.instanceId === "tabs.items.rosParameters")).toHaveLength(4);
  });

  test("legacy and shadow retain every service while compat-read removes both verified ROS Bag actions", () => {
    const services = collectServiceRefs();
    const expectedCompatRead = services.filter((binding) =>
      !binding.instanceId.endsWith(".bagStartRecord") &&
      !binding.instanceId.endsWith(".bagStopRecord"));

    expect(filterLegacyServiceBindingsForMode("legacy", services)).toEqual(services);
    expect(filterLegacyServiceBindingsForMode("shadow", services)).toEqual(services);
    expect(filterLegacyServiceBindingsForMode("compat-read", services)).toEqual(expectedCompatRead);
  });
});
