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
  'source /opt/ros/${ROS_DISTRO}/setup.bash && \
   ros2 topic pub /speed std_msgs/msg/Float64 "{data: 5.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/${ROS_DISTRO}/setup.bash && \
   ros2 topic pub /accel std_msgs/msg/Float64 "{data: 3.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/${ROS_DISTRO}/setup.bash && \
   ros2 topic pub /heading std_msgs/msg/Float64 "{data: 30.0}"'
```

```bash
docker exec -it ggcs-rosbridge /bin/bash -c \
  'source /opt/ros/${ROS_DISTRO}/setup.bash && \
   ros2 topic pub /gps sensor_msgs/msg/NavSatFix "{latitude: 36.000, longitude: 42.000}"'
```
