# syntax=docker/dockerfile:1
# Multi-stage production build for the legacy React application.

ARG DOCKER_REGISTRY=docker.io
ARG NODE_VERSION=22.23.2
FROM ${DOCKER_REGISTRY}/library/node:${NODE_VERSION}-bookworm AS builder

ARG REACT_APP_GGCS_ROSBRIDGE_URL
ARG NEXUS_NPM_REGISTRY=""
ARG NEXUS_PYPI_INDEX_URL=""
ARG NEXUS_APT_DEBIAN_URL=""
ARG NEXUS_APT_DEBIAN_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_URL=""
ARG NEXUS_APT_UBUNTU_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_PORTS_URL=""
ARG NEXUS_APT_ROS2_URL=""

ENV REACT_APP_GGCS_ROSBRIDGE_URL=${REACT_APP_GGCS_ROSBRIDGE_URL}
WORKDIR /app

COPY docker/nexus/configure-registries.sh /usr/local/bin/ggcs-configure-registries
RUN ggcs-configure-registries

COPY package.json package-lock.json tsconfig.json ./
RUN if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
      export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
    fi \
    && npm ci

COPY src ./src
COPY public ./public
RUN npm run build

FROM ${DOCKER_REGISTRY}/library/nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
