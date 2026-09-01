FROM ros:humble-ros-core-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ros-${ROS_DISTRO}-rosbridge-server \
      ros-${ROS_DISTRO}-rmw-cyclonedds-cpp \
    && rm -rf /var/lib/apt/lists/*

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV ROS_LOCALHOST_ONLY=0

EXPOSE 9090

CMD ["ros2", "launch", "rosbridge_server", "rosbridge_websocket_launch.xml", \
     "call_services_in_new_thread:=true", \
     "default_call_service_timeout:=5.0", \
     "send_action_goals_in_new_thread:=true"]
