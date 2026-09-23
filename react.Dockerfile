# syntax=docker/dockerfile:1

ARG DOCKER_REGISTRY=docker.io
ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=10.34.5
FROM ${DOCKER_REGISTRY}/library/node:${NODE_VERSION}-bookworm

ARG PNPM_VERSION
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
RUN ggcs-configure-registries \
    && if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
         export COREPACK_NPM_REGISTRY="${NEXUS_NPM_REGISTRY%/}"; \
         export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
       fi \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate

# The Web app consumes monorepo workspace packages. Keep the Web image on the same
# canonical package-manager boundary instead of the legacy isolated npm install.
COPY . .
RUN --mount=type=cache,id=ggcs-web-pnpm-store,target=/pnpm/store,sharing=locked \
    if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
      export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
    fi \
    && pnpm config set store-dir /pnpm/store \
    && pnpm install \
    && pnpm --filter @ggcs/sensor-suite build

ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["pnpm", "start"]
