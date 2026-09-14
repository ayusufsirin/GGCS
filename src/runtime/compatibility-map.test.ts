jest.mock("@ggcs/sensor-suite", () => ({
  SENSOR_SUITE_RESOURCE_IDS: {
    navRollDeg: "nav.roll.deg",
    navPitchDeg: "nav.pitch.deg",
    navHeadingDeg: "nav.heading.deg",
    vehicleSpeed: "vehicle.speed",
    navAltitudeM: "nav.altitude.m",
    navLatitudeDeg: "nav.latitude.deg",
    navLongitudeDeg: "nav.longitude.deg",
    arnavSatellites: "arnav.satellites",
    healthSystem: "arnav.health.system",
    healthRollPitch: "arnav.health.rollPitch",
    healthYaw: "arnav.health.yaw",
    healthPositionVelocity: "arnav.health.positionVelocity",
    healthMagnetometer: "arnav.health.magnetometer",
    healthGnssFixed: "arnav.health.gnssFixed",
    rtkFixedLegacy: "arnav.display.rtkFixedLegacy",
    vehicleAcceleration: "vehicle.acceleration",
    zedRecordingStart: "zed.recording.start",
    zedRecordingStop: "zed.recording.stop",
    bagRecordingStart: "bag.recording.start",
    bagRecordingStop: "bag.recording.stop",
    parameters: "shadow.parameters",
  },
}));

import {
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "./compatibility-map";

describe("M04 compatibility binding map", () => {
  test("maps a low-risk Gauge port to the semantic Runtime Source", () => {
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "value",
    )).toEqual({ kind: "source", resourceId: "vehicle.speed" });
  });

  test("maps existing recording call sites to Procedures without service names", () => {
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
      "callService",
    )).toEqual({ kind: "procedure", resourceId: "bag.recording.start" });
  });

  test("prepares ROSParametersWidget for ParameterProvider rather than raw rosapi hooks", () => {
    expect(resolveCompatibilityCapability("tabs.items.rosParameters", "parameters")).toEqual({
      kind: "parameterProvider",
      resourceId: "shadow.parameters",
    });
  });
});
