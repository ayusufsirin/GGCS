#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from std_msgs.msg import Float64, Int64


class ShadowFixture(Node):
    def __init__(self) -> None:
        super().__init__("ggcs_m03_shadow_fixture")
        self.declare_parameter("ggcs_shadow_test_parameter", 12.5)

        self.speed_publisher = self.create_publisher(Float64, "/speed", 10)
        self.acceleration_publisher = self.create_publisher(Float64, "/accel", 10)
        self.satellites_publisher = self.create_publisher(
            Int64, "/arnav/satellites", 10
        )

        self.sequence = 1
        self.timer = self.create_timer(0.2, self.publish_sample)
        self.get_logger().info(
            "M03 shadow fixture publishing /speed, /accel, and /arnav/satellites at 5 Hz"
        )
        self.get_logger().info(
            "M03 shadow fixture declaring read-only proof parameter "
            "ggcs_shadow_test_parameter=12.5"
        )

    def publish_sample(self) -> None:
        sequence = self.sequence
        self.sequence += 1

        speed = Float64()
        speed.data = float(sequence)
        self.speed_publisher.publish(speed)

        acceleration = Float64()
        acceleration.data = float(sequence) + 0.5
        self.acceleration_publisher.publish(acceleration)

        satellites = Int64()
        satellites.data = 1000 + sequence
        self.satellites_publisher.publish(satellites)


def main() -> None:
    rclpy.init()
    node = ShadowFixture()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
