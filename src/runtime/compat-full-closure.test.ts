import { config } from "../config";
import { collectSubscriberBindings } from "../middleware/binders/subscribers";
import { collectServiceBindings } from "../middleware/binders/services";
import { collectConstantBindings } from "../middleware/binders/constants";
import { collectPublisherBindings } from "../middleware/binders/publishers";
import { isM04Slice6RuntimeReadPort } from "./compatibility-map";

describe("M04-S6 compat-full closure contract", () => {
  test("the active config has no publisher/constant dependency in the accepted new mode", () => {
    expect(collectPublisherBindings(config)).toEqual([]);
    expect(collectConstantBindings(config)).toEqual([]);
  });

  test("every active subscriber has Runtime authority in compat-full including camera", () => {
    const subscribers = collectSubscriberBindings(config);
    expect(subscribers).toHaveLength(19);
    expect(subscribers.every((binding) =>
      isM04Slice6RuntimeReadPort(binding.instanceId, binding.attrName),
    )).toBe(true);
  });

  test("the active eight legacy service bindings are all superseded before binder shutdown", () => {
    expect(collectServiceBindings(config)).toHaveLength(8);
  });
});
