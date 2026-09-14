#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from ardiclabs_arnav_msgs.msg import Ins
from std_msgs.msg import Float64, Int64


class ProductionContractFixture(Node):
    def __init__(self) -> None:
        super().__init__("ggcs_m03_contract_fixture")
        self.declare_parameter("ggcs_shadow_test_parameter", 12.5)

        self.arnav_publisher = self.create_publisher(
            Ins, "/ArdicLabs/Arnav/Gnss_Ins_data", 10
        )
        self.speed_publisher = self.create_publisher(Float64, "/speed", 10)
        self.acceleration_publisher = self.create_publisher(Float64, "/accel", 10)
        self.satellites_publisher = self.create_publisher(
            Int64, "/arnav/satellites", 10
        )

        self.sequence = 0
        self.timer = self.create_timer(0.04, self.publish_sample)  # 25 Hz
        self.get_logger().info(
            "M03 production-contract fixture publishing production topic names at 25 Hz"
        )
        self.get_logger().info(
            "ArNav interface is a test-only schema-compatible fixture; no hardware/driver qualification is implied"
        )

    def publish_sample(self) -> None:
        self.sequence += 1
        sequence = self.sequence

        ins = Ins()
        ins.roll_rad = 0.10 + sequence * 0.00001
        ins.pitch_rad = -0.20 + sequence * 0.00001
        ins.yaw_rad = 0.30 + sequence * 0.00001
        ins.lat_rad = 0.70 + sequence * 0.0000000001
        ins.lon_rad = 0.50 + sequence * 0.0000000001
        ins.h_m = 123.0 + sequence * 0.001
        ins.status.system_ok = True
        ins.status.roll_pitch_ok = True
        ins.status.yaw_ok = True
        ins.status.pos_vel_ok = False
        ins.status.mag_ok = True
        ins.status.gnss_fixed = True
        self.arnav_publisher.publish(ins)

        speed = Float64()
        speed.data = 20.0 + sequence * 0.001
        self.speed_publisher.publish(speed)

        acceleration = Float64()
        acceleration.data = 1.0 + sequence * 0.001
        self.acceleration_publisher.publish(acceleration)

        if sequence % 5 == 0:  # 5 Hz low-rate evidence
            satellites = Int64()
            satellites.data = 17
            self.satellites_publisher.publish(satellites)


def main() -> None:
    rclpy.init()
    node = ProductionContractFixture()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
