FROM ros:humble

RUN apt -y update && apt -y install \
    ros-${ROS_DISTRO}-rosbridge-server
