# Multi-stage build for production

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json .npmrc ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public

# Build argument for ROS bridge URL
ARG REACT_APP_GGCS_ROSBRIDGE_URL=ws://10.0.0.50:9090
ENV REACT_APP_GGCS_ROSBRIDGE_URL=${REACT_APP_GGCS_ROSBRIDGE_URL}

# Build the app
RUN npm run build

# Stage 2: Production server
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx config if needed (optional)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
