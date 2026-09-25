# syntax=docker/dockerfile:1

ARG DOCKER_REGISTRY=docker.io
ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=10.34.5

FROM ${DOCKER_REGISTRY}/library/node:${NODE_VERSION}-bookworm AS workspace-base
ARG PNPM_VERSION
ARG NEXUS_NPM_REGISTRY=""
ARG NEXUS_PYPI_INDEX_URL=""
ARG NEXUS_APT_DEBIAN_URL=""
ARG NEXUS_APT_DEBIAN_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_URL=""
ARG NEXUS_APT_UBUNTU_SECURITY_URL=""
ARG NEXUS_APT_UBUNTU_PORTS_URL=""
ARG NEXUS_APT_ROS2_URL=""

WORKDIR /workspace
ENV CI=true

COPY docker/nexus/configure-registries.sh /usr/local/bin/ggcs-configure-registries
RUN ggcs-configure-registries \
    && if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
         export COREPACK_NPM_REGISTRY="${NEXUS_NPM_REGISTRY%/}"; \
         export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
       fi \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate

# Keep dependency resolution independent from frequently changing source files.
# New workspace packages must add their package.json here when introduced.
FROM workspace-base AS dependencies
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/ros/package.json packages/ros/package.json
COPY packages/ros-std-msgs/package.json packages/ros-std-msgs/package.json
COPY packages/sensor-suite/package.json packages/sensor-suite/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY packages/transforms/package.json packages/transforms/package.json
COPY packages/transport-rosbridge/package.json packages/transport-rosbridge/package.json
COPY packages/widgets/package.json packages/widgets/package.json
COPY plugins/arnav/package.json plugins/arnav/package.json
COPY apps/examples/minimal-headless/package.json apps/examples/minimal-headless/package.json
COPY apps/examples/rosbridge-command-headless/package.json apps/examples/rosbridge-command-headless/package.json
COPY apps/examples/rosbridge-headless/package.json apps/examples/rosbridge-headless/package.json
COPY apps/examples/rosbridge-parameter-headless/package.json apps/examples/rosbridge-parameter-headless/package.json
COPY apps/examples/rosbridge-service-headless/package.json apps/examples/rosbridge-service-headless/package.json
COPY apps/examples/rosbridge-topic-headless/package.json apps/examples/rosbridge-topic-headless/package.json
COPY apps/examples/sensor-suite-shadow-headless/package.json apps/examples/sensor-suite-shadow-headless/package.json
COPY apps/examples/sensor-suite-shadow-live-proof/package.json apps/examples/sensor-suite-shadow-live-proof/package.json
COPY apps/examples/sensor-suite-shadow-on-target-proof/package.json apps/examples/sensor-suite-shadow-on-target-proof/package.json
RUN --mount=type=cache,id=ggcs-pnpm-store,target=/pnpm/store,sharing=locked \
    if [ -n "${NEXUS_NPM_REGISTRY}" ]; then \
      export NPM_CONFIG_REGISTRY="${NEXUS_NPM_REGISTRY%/}/"; \
    fi \
    && pnpm config set store-dir /pnpm/store \
    && if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      echo "WARNING: pnpm-lock.yaml is missing; installing without --frozen-lockfile"; \
      pnpm install; \
    fi

FROM workspace-base AS workspace
COPY --from=dependencies /workspace/ /workspace/
COPY . .

FROM workspace AS m01-verify
CMD ["pnpm", "run", "verify:m01"]

FROM workspace AS m01-example
RUN pnpm run build:m01
CMD ["pnpm", "run", "example:m01"]

FROM workspace AS m02-verify
CMD ["pnpm", "run", "verify:m02"]

FROM workspace AS m02-example
RUN pnpm run build:m02
CMD ["pnpm", "run", "example:m02"]

FROM workspace AS m03-verify
CMD ["pnpm", "run", "verify:m03"]

FROM workspace AS m04-verify
CMD ["pnpm", "run", "verify:m04"]

FROM workspace AS m05-verify
CMD ["pnpm", "run", "verify:m05"]

FROM workspace AS m03-live-proof
RUN pnpm run build:m03
CMD ["pnpm", "run", "example:m03:live"]

FROM workspace AS m03-on-target-proof
RUN pnpm run build:m03
CMD ["pnpm", "run", "example:m03:on-target"]
