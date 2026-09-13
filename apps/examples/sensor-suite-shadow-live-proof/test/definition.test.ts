import { describe, expect, it } from "vitest";
import { DERIVED_PROVIDER_ID } from "@ggcs/core";
import { ROSBRIDGE_PROVIDER_IDS } from "@ggcs/transport-rosbridge";
import {
  LIVE_RESOURCE_IDS,
  LIVE_TOPIC_NAMES,
  createLiveShadowDefinition,
} from "../src/definition.js";

describe("M03 live shadow proof definition", () => {
  it("contains only the three low-bandwidth observational topic sources plus read-only evidence resources", () => {
    const definition = createLiveShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9091" });
    const topicSources = definition.resources.filter(
      (resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.topicSource,
    );
    expect(topicSources).toHaveLength(3);
    expect(topicSources.map((resource) => (resource.config as { topic: string }).topic).sort()).toEqual(
      [LIVE_TOPIC_NAMES.speed, LIVE_TOPIC_NAMES.acceleration, LIVE_TOPIC_NAMES.satellites].sort(),
    );
    expect(definition.resources.some((resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.topicCommand)).toBe(false);
    expect(definition.resources.some((resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.serviceProcedure)).toBe(false);
    expect(definition.resources.filter((resource) => resource.provider === ROSBRIDGE_PROVIDER_IDS.parameterProvider)).toHaveLength(1);
  });

  it("keeps all three semantic telemetry resources derived", () => {
    const definition = createLiveShadowDefinition({ rosbridgeUrl: "ws://shadow.invalid:9091" });
    for (const id of [LIVE_RESOURCE_IDS.speed, LIVE_RESOURCE_IDS.acceleration, LIVE_RESOURCE_IDS.satellites]) {
      expect(definition.resources.find((resource) => resource.id === id)?.provider).toBe(DERIVED_PROVIDER_ID);
    }
  });
});
