# syntax=docker/dockerfile:1
# Multi-stage production build for the React application with M04 workspace packages.

ARG DOCKER_REGISTRY=docker.io
ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=10.34.5
FROM ${DOCKER_REGISTRY}/library/node:${NODE_VERSION}-bookworm AS builder

ARG PNPM_VERSION
ARG REACT_APP_GGCS_ROSBRIDGE_URL
ARG REACT_APP_GGCS_BACKEND_MODE=legacy
ARG NEXUS_NPM_REGISTRY=""
ARG NEXUS_PYPI_INDEX_URL=""
ARG NEXUS_APT_DEBIAN_URL=""
ARG NEXUS_APT_DEBIAN_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_URL=""
ARG NEXUS_APT_UBUNTU_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_PORTS_URL=""
ARG NEXUS_APT_ROS2_URL=""

ENV REACT_APP_GGCS_ROSBRIDGE_URL=${REACT_APP_GGCS_ROSBRIDGE_URL}
ENV REACT_APP_GGCS_BACKEND_MODE=${REACT_APP_GGCS_BACKEND_MODE}
WORKDIR /app

COPY docker/nexus/configure-registries.sh /usr/local/bin/ggcs-configure-registries
RUN ggcs-configure-registries \
    && if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
         export COREPACK_NPM_REGISTRY="${NEXUS_NPM_REGISTRY%/}"; \
         export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
       fi \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY . .
RUN --mount=type=cache,id=ggcs-web-prod-pnpm-store,target=/pnpm/store,sharing=locked \
    if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
      export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
    fi \
    && pnpm config set store-dir /pnpm/store \
    && pnpm install \
    && pnpm --filter @ggcs/sensor-suite build \
    && pnpm run build

FROM ${DOCKER_REGISTRY}/library/nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
