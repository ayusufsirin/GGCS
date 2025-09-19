FROM ros:humble-ros-core-jammy

RUN apt -y update && apt -y install \
    ros-${ROS_DISTRO}-rosbridge-server \
    ros-${ROS_DISTRO}-rmw-cyclonedds-cpp

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV ROS_LOCALHOST_ONLY=1
