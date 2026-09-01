ARG NODE_VERSION=22.23.2
FROM node:${NODE_VERSION}-bookworm

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["npm", "start"]
