FROM ros:humble-ros-core-jammy

RUN apt -y update && apt -y install \
    ros-${ROS_DISTRO}-rosbridge-server

ENV ROS_LOCALHOST_ONLY=1
