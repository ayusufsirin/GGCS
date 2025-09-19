FROM ros:foxy

RUN apt -y update && apt -y install \
    ros-${ROS_DISTRO}-rosbridge-* \
    ros-${ROS_DISTRO}-rmw-cyclonedds-cpp

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV ROS_LOCALHOST_ONLY=1
