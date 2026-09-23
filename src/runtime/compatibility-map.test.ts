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
    cameraZedRgbData: "camera.zed.rgb.data",
    zedRecordingStart: "zed.recording.start",
    zedRecordingStop: "zed.recording.stop",
    bagRecordingStart: "bag.recording.start",
    bagRecordingStop: "bag.recording.stop",
    parameters: "shadow.parameters",
  },
}));

import {
  isCompatibilityParameterCapability,
  isCompatibilityProcedurePort,
  isCompatibilitySourcePort,
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "./compatibility-map";

describe("M05 Runtime-only migration binding map", () => {
  test("maps telemetry and camera ports to semantic Sources", () => {
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "value",
    )).toEqual({ kind: "source", resourceId: "vehicle.speed" });
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.map",
      "latitude",
    )).toEqual({ kind: "source", resourceId: "nav.latitude.deg" });
    expect(resolveCompatibilityBinding(
      "tabs.items.images.grids.items.zedRgb",
      "image",
    )).toEqual({ kind: "source", resourceId: "camera.zed.rgb.data" });
    expect(isCompatibilitySourcePort(
      "tabs.items.home.grids.items.rtkSystemStatus",
      "status",
    )).toBe(true);
  });

  test("maps all four recording actions to Procedures", () => {
    [
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
    ].forEach((instanceId) => {
      expect(isCompatibilityProcedurePort(instanceId, "callService")).toBe(true);
    });
  });

  test("maps parameter browser to ParameterProvider and leaves unknown ports unbound", () => {
    expect(resolveCompatibilityCapability("tabs.items.rosParameters", "parameters")).toEqual({
      kind: "parameterProvider",
      resourceId: "shadow.parameters",
    });
    expect(isCompatibilityParameterCapability("tabs.items.rosParameters", "parameters")).toBe(true);
    expect(resolveCompatibilityBinding("tabs.items.home.grids.items.map", "waypointsUrl")).toBeUndefined();
  });
});
