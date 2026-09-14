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
  M04_SLICE_2_RUNTIME_READ_TARGET,
  isM04Slice2RuntimeReadPort,
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

  test("enables Runtime reads for exactly the first low-risk Status port in S2", () => {
    expect(M04_SLICE_2_RUNTIME_READ_TARGET).toEqual({
      instanceId: "tabs.items.home.grids.items.rtkSystemStatus",
      portName: "status",
    });
    expect(isM04Slice2RuntimeReadPort(
      M04_SLICE_2_RUNTIME_READ_TARGET.instanceId,
      M04_SLICE_2_RUNTIME_READ_TARGET.portName,
    )).toBe(true);
    expect(isM04Slice2RuntimeReadPort(
      "tabs.items.home.grids.items.rtkRollPitchStatus",
      "status",
    )).toBe(false);
    expect(isM04Slice2RuntimeReadPort(
      "tabs.items.home.grids.items.panel.tabs.items.gauges.grids.items.speed",
      "value",
    )).toBe(false);
  });
});
