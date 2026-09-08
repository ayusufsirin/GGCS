#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import Float64


class TopicFixture(Node):
    def __init__(self) -> None:
        super().__init__("ggcs_m02_topic_fixture")
        self.publisher = self.create_publisher(Float64, "/ggcs_test/temperature", 10)
        self.command_ready_publisher = self.create_publisher(
            Float64, "/ggcs_test/command_ready", 10
        )
        self.command_observed_publisher = self.create_publisher(
            Float64, "/ggcs_test/command_observed", 10
        )
        self.command_subscription = self.create_subscription(
            Float64, "/ggcs_test/command", self.observe_command, 10
        )
        self.get_logger().info(
            "M02 fixture publishing std_msgs/msg/Float64 on /ggcs_test/temperature"
        )
        self.get_logger().info(
            "M02 fixture observing /ggcs_test/command and echoing to /ggcs_test/command_observed"
        )
        self.value = 31.5
        self.timer = self.create_timer(0.2, self.publish_sample)

    def publish_sample(self) -> None:
        message = Float64()
        message.data = self.value
        self.publisher.publish(message)
        self.value += 0.25

        ready = Float64()
        ready.data = 1.0
        self.command_ready_publisher.publish(ready)

    def observe_command(self, message: Float64) -> None:
        self.get_logger().info(
            f"M02 fixture observed command data={message.data} on /ggcs_test/command"
        )
        observed = Float64()
        observed.data = message.data
        self.command_observed_publisher.publish(observed)


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
