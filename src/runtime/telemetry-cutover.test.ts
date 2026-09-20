import { config } from "../config";
import { collectBindings, isObject } from "../middleware/config-scan";
import { ValueTypes } from "../interfaces";
import { isM04Slice3RuntimeReadPort } from "./compatibility-map";
import { filterLegacySubscriberBindingsForMode } from "./telemetry-cutover";

interface SubscriberRef {
  readonly instanceId: string;
  readonly attrName: string;
}

function collectSubscriberRefs(): SubscriberRef[] {
  return collectBindings<SubscriberRef>(
    config,
    (entry) => entry.type === ValueTypes.subscriber && isObject(entry.topic),
    ({ instanceId, attrName }) => ({ instanceId, attrName }),
  );
}

describe("M04-S3 telemetry cutover policy", () => {
  test("the compatibility map covers every active low-bandwidth subscriber and leaves only camera legacy", () => {
    const subscribers = collectSubscriberRefs();
    const runtimePorts = subscribers.filter((binding) =>
      isM04Slice3RuntimeReadPort(binding.instanceId, binding.attrName));
    const legacyExceptions = subscribers.filter((binding) =>
      !isM04Slice3RuntimeReadPort(binding.instanceId, binding.attrName));

    expect(subscribers).toHaveLength(19);
    expect(runtimePorts).toHaveLength(18);
    expect(legacyExceptions).toEqual([
      { instanceId: "tabs.items.images.grids.items.zedRgb", attrName: "image" },
    ]);
  });

  test("legacy and shadow retain all legacy subscribers while compat-read removes every migrated telemetry binding", () => {
    const subscribers = collectSubscriberRefs();

    expect(filterLegacySubscriberBindingsForMode("legacy", subscribers)).toEqual(subscribers);
    expect(filterLegacySubscriberBindingsForMode("shadow", subscribers)).toEqual(subscribers);
    expect(filterLegacySubscriberBindingsForMode("compat-read", subscribers)).toEqual([
      { instanceId: "tabs.items.images.grids.items.zedRgb", attrName: "image" },
    ]);
  });
});
