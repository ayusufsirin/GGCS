import {
  SENSOR_SUITE_RESOURCE_IDS,
  compileSensorSuiteShadowApplication,
} from "./definition.js";

const platform = globalThis as unknown as {
  readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
  readonly console?: { log(...args: unknown[]): void };
};
const environment = platform.process?.env ?? {};
const endpoint = environment.GGCS_ROSBRIDGE_URL ?? "ws://localhost:9090";

const compiled = compileSensorSuiteShadowApplication({ rosbridgeUrl: endpoint });
const ids = SENSOR_SUITE_RESOURCE_IDS;

platform.console?.log(
  JSON.stringify(
    {
      mode: "shadow-definition-compile-only",
      endpoint,
      resources: compiled.orderedResources.map((resource) => resource.id),
      arnavRawSource: ids.arnavInsRaw,
      lowBandwidthRawSources: [
        ids.arnavInsRaw,
        ids.vehicleSpeedRaw,
        ids.vehicleAccelerationRaw,
        ids.arnavSatellitesRaw,
      ],
      numericSemanticResources: [
        ids.vehicleSpeed,
        ids.vehicleAcceleration,
        ids.arnavSatellites,
      ],
    },
    null,
    2,
  ),
);
