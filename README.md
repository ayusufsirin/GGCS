# GGCS: The Generic Ground Control Station for ROS

![Logo](./public/logo512.png)

## Creating the React Project

```bash
npx create-react-app ggcs --template typescript
```

## Docker-first development and verification

GGCS uses Docker/Compose as the canonical environment boundary. A developer should only need Docker Engine with the Compose plugin for normal build, verification, development, and deployment workflows; installing Node, pnpm, npm, ROS, or nginx directly on the host is optional.

### Optional Nexus repository proxies

GGCS can route Docker base images, npm/pnpm/Corepack, PyPI/pip, Debian/Ubuntu APT, and ROS 2 APT downloads through Nexus Repository Manager. Nexus is optional: if `.env` is absent, or an individual `NEXUS_*` variable is blank, the corresponding public upstream is used directly.

Start from the committed template only when Nexus overrides are needed:

```bash
cp .env.example .env
```

Fill only the endpoints that exist in your Nexus instance. For example:

```dotenv
NEXUS_DOCKER_REGISTRY=nexus.example.com/repository/docker-all
NEXUS_NPM_REGISTRY=https://nexus.example.com/repository/npm-all/
NEXUS_PYPI_INDEX_URL=https://nexus.example.com/repository/pypi-all/simple
NEXUS_APT_DEBIAN_URL=https://nexus.example.com/repository/apt-debian
NEXUS_APT_DEBIAN_SECURITY_URL=https://nexus.example.com/repository/apt-debian-security
NEXUS_APT_UBUNTU_URL=https://nexus.example.com/repository/apt-ubuntu
NEXUS_APT_UBUNTU_SECURITY_URL=https://nexus.example.com/repository/apt-ubuntu-security
NEXUS_APT_UBUNTU_PORTS_URL=https://nexus.example.com/repository/apt-ubuntu-ports
NEXUS_APT_ROS2_URL=https://nexus.example.com/repository/apt-ros2
```

`NEXUS_DOCKER_REGISTRY` is an image-reference prefix, so do not include `https://`. Local `.env` files are ignored by Git and must not contain source-controlled secrets. Nexus credentials are intentionally not passed as Docker build arguments; prefer anonymous/network-restricted read access for proxy groups, `docker login` for authenticated image pulls, and BuildKit secrets if authenticated package downloads become mandatory.

With or without Nexus, the Compose commands remain identical:

```bash
docker compose --profile verify run --rm --build m01-verify
```

The registry-selection implementation is in `docker/nexus/configure-registries.sh`.

### Headless Core canonical verification

```bash
docker compose --profile verify run --rm --build m01-verify
```

This builds the Node 22 / pnpm 10.34.5 workspace image and runs the complete Milestone 01 gate (`build:m01`, real Vitest acceptance tests, dependency-boundary validation, and the minimal headless example).

Run only the minimal headless example with:

```bash
docker compose --profile example run --rm --build m01-example
```

### Legacy Web development

```bash
docker compose --profile web up --build web-dev
```

The development server is exposed on `http://localhost:3000` by default. `src/` and `public/` are bind-mounted for source iteration while dependencies remain inside the image.

### Web production image

```bash
REACT_APP_GGCS_ROSBRIDGE_URL=ws://robot-host:9090 \
  docker compose --profile web-prod up --build -d web-prod
```

The production nginx service is exposed on `http://localhost:8080` by default.

### ROSBridge

```bash
docker compose --profile ros up --build -d rosbridge
```

ROSBridge is exposed on port `9090` by default. Environment variables such as `ROS_LOCALHOST_ONLY`, `RMW_IMPLEMENTATION`, and `GGCS_ROSBRIDGE_PORT` can be overridden through the host environment or a Compose `.env` file.

### Combined Web + ROSBridge development

```bash
docker compose --profile web --profile ros up --build web-dev rosbridge
```

The browser-facing default URL remains `ws://localhost:9090`, because the React application executes in the user's browser rather than inside the Compose network.

### Docker policy for later milestones

Every subsequent GGCS milestone must provide a containerized path for the components it introduces. Native host commands may remain useful for debugging, but they are not the canonical reproducibility gate. CI should invoke the same Docker/Compose workflows used by developers rather than maintain a second environment definition.


## Legacy/manual Docker commands (compatibility)

The Compose workflows above are canonical. The commands below are retained for direct image export/testing during the strangler migration.

### Production

### Build

```bash
docker build . -t ggcs-react-prod -f react.prod.Dockerfile \
    --platform linux/arm64 \
    --build-arg REACT_APP_GGCS_ROSBRIDGE_URL=ws://10.42.0.1:9090
docker save ggcs-react-prod > ggcs-react-prod.tar
```

```bash
docker build . -t ggcs-react-prod -f react.prod.Dockerfile \
    --platform linux/arm64
docker save ggcs-react-prod > ggcs-react-prod.tar
```

### Run (serves on port 80)

```bash
docker load < ggcs-react-prod.tar
docker run --restart always -d -p 8080:80 ggcs-react-prod
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
   ros2 topic pub /roll std_msgs/msg/Float64 "{data: 30.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /pitch std_msgs/msg/Float64 "{data: 30.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /gps sensor_msgs/msg/NavSatFix "{latitude: 36.000, longitude: 42.000, altitude: 10.5}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /relay/state std_msgs/msg/Bool "{data: false}"'
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

## Headless platform migration (Milestone 01)

The repository now contains the first strangler-migration workspaces beside the existing React application:

```text
packages/schema
packages/core
packages/plugin-sdk
packages/testing
apps/examples/minimal-headless
```

These packages are intentionally non-ROS and non-renderer. The legacy React application remains in `src/` and is not migrated by Milestone 01.

The canonical M01 verification is Dockerized:

```bash
docker compose --profile verify run --rm --build m01-verify
```

For low-level debugging only, the equivalent host command remains `pnpm run verify:m01` after enabling Corepack and installing dependencies. The Docker/Compose path is the reproducibility gate.

The canonical architecture, milestone gates, and continuation rules are maintained in the GGCS Drive project area (`AGENTS.md`, `ROADMAP_V0.md`, and the accepted ADRs).
