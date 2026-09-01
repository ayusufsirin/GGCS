# syntax=docker/dockerfile:1

ARG DOCKER_REGISTRY=docker.io
ARG NODE_VERSION=22.23.2
FROM ${DOCKER_REGISTRY}/library/node:${NODE_VERSION}-bookworm

ARG NEXUS_NPM_REGISTRY=""
ARG NEXUS_PYPI_INDEX_URL=""
ARG NEXUS_APT_DEBIAN_URL=""
ARG NEXUS_APT_DEBIAN_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_URL=""
ARG NEXUS_APT_UBUNTU_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_PORTS_URL=""
ARG NEXUS_APT_ROS2_URL=""

WORKDIR /app

COPY docker/nexus/configure-registries.sh /usr/local/bin/ggcs-configure-registries
RUN ggcs-configure-registries

COPY package.json package-lock.json ./
RUN if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
      export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
    fi \
    && npm ci

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["npm", "start"]
