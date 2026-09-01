# Multi-stage production build for the legacy React application.
ARG NODE_VERSION=22.23.2
FROM node:${NODE_VERSION}-bookworm AS builder

WORKDIR /app

ARG REACT_APP_GGCS_ROSBRIDGE_URL
ENV REACT_APP_GGCS_ROSBRIDGE_URL=${REACT_APP_GGCS_ROSBRIDGE_URL}

COPY package.json package-lock.json tsconfig.json .npmrc ./
RUN npm ci

COPY src ./src
COPY public ./public
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
