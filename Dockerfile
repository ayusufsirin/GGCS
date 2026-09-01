# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=10.34.5

FROM node:${NODE_VERSION}-bookworm AS workspace
ARG PNPM_VERSION
WORKDIR /workspace
ENV CI=true
RUN corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY . .
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      echo "WARNING: pnpm-lock.yaml is missing; installing without --frozen-lockfile"; \
      pnpm install; \
    fi

FROM workspace AS m01-verify
CMD ["pnpm", "run", "verify:m01"]

FROM workspace AS m01-example
RUN pnpm run build:m01
CMD ["pnpm", "run", "example:m01"]
