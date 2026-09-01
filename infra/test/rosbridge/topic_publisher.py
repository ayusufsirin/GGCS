#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import Float64


class TopicFixture(Node):
    def __init__(self) -> None:
        super().__init__("ggcs_m02_topic_fixture")
        self.publisher = self.create_publisher(Float64, "/ggcs_test/temperature", 10)
        self.get_logger().info(
            "M02 fixture publishing std_msgs/msg/Float64 on /ggcs_test/temperature"
        )
        self.value = 31.5
        self.timer = self.create_timer(0.2, self.publish_sample)

    def publish_sample(self) -> None:
        message = Float64()
        message.data = self.value
        self.publisher.publish(message)
        self.value += 0.25


def main() -> None:
    rclpy.init()
    node = TopicFixture()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
