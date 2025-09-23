# GGCS: The Generic Ground Control Station for ROS

![Logo](./public/logo512.png)

## Creating the React Project

```bash
npx create-react-app ggcs --template typescript
```

## Running the Application

```bash
docker build . -t ggcs-react -f react.Dockerfile
```

```bash
docker run --rm -it -v $PWD:/app/ ggcs-react npm install
```

```bash
docker run --rm -it -v $PWD:/app/ ggcs-react npm start
```

```bash
docker run --rm -it -v $PWD:/app/ ggcs-react npm run build
```

## Configuration Management

Flexible configuration ...

## Testing with Synthetic Data

```bash
docker build . -t ggcs-rosbridge -f rosbridge.Dockerfile
docker run --rm --name ggcs-rosbridge -p 9090:9090 \
  ggcs-rosbridge ros2 launch rosbridge_server rosbridge_websocket_launch.xml \
  call_services_in_new_thread:=true \
  default_call_service_timeout:=5.0 \
  send_action_goals_in_new_thread:=true
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /speed std_msgs/msg/Float64 "{data: 5.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /accel std_msgs/msg/Float64 "{data: 3.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /heading std_msgs/msg/Float64 "{data: 30.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /gps sensor_msgs/msg/NavSatFix "{latitude: 36.000, longitude: 42.000}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -lc '
source /opt/ros/humble/setup.bash && python3 - <<PY
import rclpy, time, random
from rclpy.node import Node
from diagnostic_msgs.msg import DiagnosticArray, DiagnosticStatus, KeyValue

rclpy.init()
node = Node("mock_diagnostics_pub")
pub = node.create_publisher(DiagnosticArray, "/diagnostics", 10)

def make_msg():
    arr = DiagnosticArray()
    arr.header.stamp = node.get_clock().now().to_msg()

    def S(name, level, msg, kv): 
        s = DiagnosticStatus()
        s.name = name
        s.level = level
        s.message = msg
        s.hardware_id = f"{name}-001"
        s.values = [KeyValue(key=k, value=v) for k,v in kv.items()]
        return s

    arr.status = [
        S("imu", DiagnosticStatus.OK, "IMU OK", {"temperature": f"{36.0+random.random():.1f}"}),
        S("battery", DiagnosticStatus.OK if random.random()>0.2 else DiagnosticStatus.WARN,
          "Battery nominal" if random.random()>0.2 else "Battery Warning",
          {"voltage": f"{11.0+random.random():.2f}"}),
        S("gps", DiagnosticStatus.OK, "GPS Locked", {"satellites": f"{10+int(random.random()*5)}"})
    ]
    return arr

try:
    while rclpy.ok():
        pub.publish(make_msg())
        node.get_logger().info("Published /diagnostics with enums")
        time.sleep(1.0)
finally:
    rclpy.shutdown()
PY
'
```
