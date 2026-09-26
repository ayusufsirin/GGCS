function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}-${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}`;
}

/**
 * Application-owned recording request payloads.
 *
 * The Start-SVO filename intentionally preserves the legacy module-load timestamp
 * behavior during M05 extraction. Moving these data-only payloads out of the visual
 * button makes the semantic ProcedureAction renderer protocol-agnostic without
 * silently changing when the filename is chosen.
 */
export const SENSOR_SUITE_RECORDING_REQUESTS = Object.freeze({
  zedStart: Object.freeze({
    target_framerate: 10,
    svo_filename: `/home/neurolab/SensorSystemROS2/ros_ws_host/zed_${timestamp()}.svo2`,
  }),
  zedStop: Object.freeze({}),
  bagStart: Object.freeze({}),
  bagStop: Object.freeze({}),
});
