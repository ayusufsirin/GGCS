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
      build-essential \
      python3-colcon-common-extensions \
      ros-${ROS_DISTRO}-ament-cmake \
      ros-${ROS_DISTRO}-rclpy \
      ros-${ROS_DISTRO}-rmw-cyclonedds-cpp \
      ros-${ROS_DISTRO}-rosbridge-server \
      ros-${ROS_DISTRO}-rosidl-default-generators \
      ros-${ROS_DISTRO}-std-msgs \
    && rm -rf /var/lib/apt/lists/*

COPY infra/test/m03-contract/ardiclabs_arnav_msgs /opt/ggcs_ws/src/ardiclabs_arnav_msgs
RUN . /opt/ros/${ROS_DISTRO}/setup.sh \
    && cd /opt/ggcs_ws \
    && colcon build --merge-install --packages-select ardiclabs_arnav_msgs

COPY infra/test/m03-contract/fixture.py /opt/ggcs/fixture.py
COPY infra/test/m03-contract/entrypoint.sh /opt/ggcs/entrypoint.sh
RUN chmod +x /opt/ggcs/entrypoint.sh /opt/ggcs/fixture.py

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV ROS_LOCALHOST_ONLY=0

EXPOSE 9090
ENTRYPOINT ["/opt/ggcs/entrypoint.sh"]
