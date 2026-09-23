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
  isM04Slice3RuntimeReadPort,
  isM04Slice4RuntimeProcedurePort,
  isM04Slice5RuntimeParameterCapability,
  isM04Slice6RuntimeReadPort,
  resolveCompatibilityBinding,
  resolveCompatibilityCapability,
} from "./compatibility-map";

describe("M04 compatibility binding map", () => {
  test("maps Status/Gauge/HUD/Map telemetry ports to semantic Runtime Sources", () => {
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "value",
    )).toEqual({ kind: "source", resourceId: "vehicle.speed" });
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.hud",
      "roll",
    )).toEqual({ kind: "source", resourceId: "nav.roll.deg" });
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.map",
      "latitude",
    )).toEqual({ kind: "source", resourceId: "nav.latitude.deg" });
    expect(resolveCompatibilityBinding(
      "tabs.items.home.grids.items.rtkRollPitchStatus",
      "status",
    )).toEqual({ kind: "source", resourceId: "arnav.health.rollPitch" });
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

  test("S3 Runtime telemetry authority follows every explicit Source binding only", () => {
    expect(isM04Slice3RuntimeReadPort(
      "tabs.items.home.grids.items.rtkSystemStatus",
      "status",
    )).toBe(true);
    expect(isM04Slice3RuntimeReadPort(
      "tabs.items.home.grids.items.rtkRollPitchStatus",
      "status",
    )).toBe(true);
    expect(isM04Slice3RuntimeReadPort(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "value",
    )).toBe(true);
    expect(isM04Slice3RuntimeReadPort(
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
      "callService",
    )).toBe(false);
    expect(isM04Slice3RuntimeReadPort(
      "tabs.items.images.grids.items.zedRgb",
      "image",
    )).toBe(false);
  });
  test("S6 maps the camera compatibility value without changing S3 compat-read authority", () => {
    expect(resolveCompatibilityBinding(
      "tabs.items.images.grids.items.zedRgb",
      "image",
    )).toEqual({ kind: "source", resourceId: "camera.zed.rgb.data" });
    expect(isM04Slice3RuntimeReadPort("tabs.items.images.grids.items.zedRgb", "image")).toBe(false);
    expect(isM04Slice6RuntimeReadPort("tabs.items.images.grids.items.zedRgb", "image")).toBe(true);
  });

  test("S4 action 04 enables all four recording Procedures while rosapi stays legacy", () => {
    [
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStartSvo",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
      "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
    ].forEach((instanceId) => {
      expect(isM04Slice4RuntimeProcedurePort(instanceId, "callService")).toBe(true);
    });
    expect(isM04Slice4RuntimeProcedurePort("tabs.items.rosParameters", "listNodes")).toBe(false);
  });

  test("S5 enables the semantic ParameterProvider capability only", () => {
    expect(isM04Slice5RuntimeParameterCapability("tabs.items.rosParameters", "parameters")).toBe(true);
    expect(isM04Slice5RuntimeParameterCapability("tabs.items.rosParameters", "listNodes")).toBe(false);
  });

});
