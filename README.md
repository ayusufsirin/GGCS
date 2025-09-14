# GGCS: The Generic Ground Control Station for ROS

## Creating the React Project

```bash
npx create-react-app ggcs --template typescript
```

## Running the Application

```bash
npm start
```

## Configuration Management

Flexible configuration ...

## Testing with Synthetic Data

```bash
docker build . -t ggcs-rosbrodge
docker run --rm --name ggcs-rosbrodge -p 9090:9090 ggcs-rosbrodge ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

```bash
docker exec -it ggcs-rosbrodge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /speed std_msgs/msg/Float64 "{data: 5.0}"'
```

```bash
docker exec -it ggcs-rosbrodge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /accel std_msgs/msg/Float64 "{data: 3.0}"'
```

```bash
docker exec -it ggcs-rosbrodge /bin/bash -c \
  'source /opt/ros/humble/setup.bash && \
   ros2 topic pub /gps sensor_msgs/msg/NavSatFix "{latitude: 36.000, longitude: 42.000}"'
```
