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
  test("candidate 1 cuts over only Stop ROS Bag and leaves all other services legacy", () => {
    const services = collectServiceRefs();
    const runtimeActions = services.filter((binding) =>
      isM04Slice4RuntimeProcedurePort(binding.instanceId, binding.attrName));
    const legacyServices = services.filter((binding) =>
      !isM04Slice4RuntimeProcedurePort(binding.instanceId, binding.attrName));

    expect(services).toHaveLength(8);
    expect(runtimeActions).toEqual([
      {
        instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
        attrName: "callService",
      },
    ]);
    expect(legacyServices).toHaveLength(7);
    expect(legacyServices).toContainEqual({
      instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
      attrName: "callService",
    });
    expect(legacyServices).toContainEqual({
      instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
      attrName: "callService",
    });
    expect(legacyServices.filter((binding) => binding.instanceId === "tabs.items.rosParameters")).toHaveLength(4);
  });

  test("legacy and shadow retain every service while compat-read removes only the verified action", () => {
    const services = collectServiceRefs();
    const expectedCompatRead = services.filter((binding) =>
      binding.instanceId !== "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord");

    expect(filterLegacyServiceBindingsForMode("legacy", services)).toEqual(services);
    expect(filterLegacyServiceBindingsForMode("shadow", services)).toEqual(services);
    expect(filterLegacyServiceBindingsForMode("compat-read", services)).toEqual(expectedCompatRead);
  });
});
