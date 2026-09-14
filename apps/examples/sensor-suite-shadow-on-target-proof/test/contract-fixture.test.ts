import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("hardware-free M03 production-contract fixture", () => {
  it("defines the ArNav fields consumed by GGCS under the production message type", () => {
    const ins = read("infra/test/m03-contract/ardiclabs_arnav_msgs/msg/Ins.msg");
    const status = read("infra/test/m03-contract/ardiclabs_arnav_msgs/msg/InsStatus.msg");

    for (const field of ["roll_rad", "pitch_rad", "yaw_rad", "lat_rad", "lon_rad", "h_m"]) {
      expect(ins).toContain(`float64 ${field}`);
    }
    expect(ins).toContain("ardiclabs_arnav_msgs/InsStatus status");
    for (const field of ["system_ok", "roll_pitch_ok", "yaw_ok", "pos_vel_ok", "mag_ok", "gnss_fixed"]) {
      expect(status).toContain(`bool ${field}`);
    }
  });

  it("wires a hermetic ROS2+rosbridge contract gate instead of requiring hardware", () => {
    const compose = read("compose.yaml");
    const fixture = read("infra/test/m03-contract/fixture.py");

    expect(compose).toContain("m03-contract-ros:");
    expect(compose).toContain("ws://m03-contract-ros:9090");
    expect(compose).toContain("/ggcs_m03_contract_fixture:ggcs_shadow_test_parameter");
    expect(fixture).toContain('"/ArdicLabs/Arnav/Gnss_Ins_data"');
    expect(fixture).toContain('"/speed"');
    expect(fixture).toContain('"/accel"');
    expect(fixture).toContain('"/arnav/satellites"');
  });
});
