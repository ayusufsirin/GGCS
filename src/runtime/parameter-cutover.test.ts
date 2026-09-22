import { config } from "../config";
import { collectBindings, isObject } from "../middleware/config-scan";
import { ValueTypes } from "../interfaces";
import { filterLegacyServiceBindingsForMode } from "./action-cutover";
import {
  filterLegacyParameterServiceBindingsForMode,
  isM04Slice5LegacyParameterServicePort,
} from "./parameter-cutover";

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

describe("M04-S5 ParameterProvider cutover policy", () => {
  test("identifies exactly the four legacy ROSParametersWidget service ports", () => {
    const services = collectServiceRefs();
    const parameterServices = services.filter((binding) =>
      isM04Slice5LegacyParameterServicePort(binding.instanceId, binding.attrName));

    expect(parameterServices).toHaveLength(4);
    expect(parameterServices).toEqual(expect.arrayContaining([
      { instanceId: "tabs.items.rosParameters", attrName: "listNodes" },
      { instanceId: "tabs.items.rosParameters", attrName: "getParamNames" },
      { instanceId: "tabs.items.rosParameters", attrName: "getParam" },
      { instanceId: "tabs.items.rosParameters", attrName: "setParam" },
    ]));
  });

  test("compat-read removes rosapi compatibility services while legacy/shadow retain them", () => {
    const services = collectServiceRefs().filter((binding) =>
      binding.instanceId === "tabs.items.rosParameters");

    expect(filterLegacyParameterServiceBindingsForMode("legacy", services)).toEqual(services);
    expect(filterLegacyParameterServiceBindingsForMode("shadow", services)).toEqual(services);
    expect(filterLegacyParameterServiceBindingsForMode("compat-read", services)).toEqual([]);
  });

  test("the combined S4+S5 filters leave no legacy service bindings in compat-read", () => {
    const services = collectServiceRefs();
    const afterActions = filterLegacyServiceBindingsForMode("compat-read", services);
    expect(afterActions).toHaveLength(4);
    expect(filterLegacyParameterServiceBindingsForMode("compat-read", afterActions)).toEqual([]);
  });
});
