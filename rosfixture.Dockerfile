# syntax=docker/dockerfile:1

ARG DOCKER_REGISTRY=docker.io
FROM ${DOCKER_REGISTRY}/library/ros:humble-ros-core-jammy

ARG NEXUS_NPM_REGISTRY=""
ARG NEXUS_PYPI_INDEX_URL=""
ARG NEXUS_APT_DEBIAN_URL=""
ARG NEXUS_APT_DEBIAN_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_URL=""
ARG NEXUS_APT_UBUNTU_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_PORTS_URL=""
ARG NEXUS_APT_ROS2_URL=""

COPY docker/nexus/configure-registries.sh /usr/local/bin/ggcs-configure-registries
RUN --mount=type=cache,id=ggcs-ros-humble-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=ggcs-ros-humble-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    ggcs-configure-registries \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      ros-${ROS_DISTRO}-rclpy \
      ros-${ROS_DISTRO}-std-msgs \
      ros-${ROS_DISTRO}-std-srvs \
      ros-${ROS_DISTRO}-rmw-cyclonedds-cpp

COPY infra/test/rosbridge/topic_publisher.py /opt/ggcs/topic_publisher.py

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV ROS_LOCALHOST_ONLY=0

CMD ["python3", "/opt/ggcs/topic_publisher.py"]
