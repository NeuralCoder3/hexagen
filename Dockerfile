# syntax=docker/dockerfile:1

# -------- Base stage: install root deps --------
FROM node:20-alpine AS base
WORKDIR /app
# Install OS deps used by both builds when needed
RUN apk add --no-cache bash

# Copy root package files and install
COPY package*.json ./
RUN npm ci

# -------- Backend deps stage --------
FROM base AS backend-deps
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci

# -------- Frontend deps stage --------
FROM base AS frontend-deps
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

# -------- Backend build stage --------
FROM backend-deps AS backend-build
WORKDIR /app
# Copy the full repository (leveraging cached node_modules from previous stages)
COPY . .
# Build backend (src + scripts)
RUN cd backend && npm run build

# -------- Frontend build stage --------
FROM frontend-deps AS frontend-build
WORKDIR /app
# Copy the full repository
COPY . .
# Build frontend
RUN cd frontend && npm run build

# -------- Backend runtime image --------
FROM node:20-alpine AS backend-runtime
WORKDIR /app/backend
# Install runtime tools (ImageMagick is used for thumbnail generation)
RUN apk add --no-cache imagemagick libwebp libwebp-tools \
    && if [ ! -x /usr/bin/magick ] && [ -x /usr/bin/convert ]; then ln -s /usr/bin/convert /usr/bin/magick; fi

# Copy backend build output, compiled scripts, and runtime node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-deps /app/backend/node_modules ./node_modules
# Copy non-TS runtime assets (templates)
COPY backend/templates ./templates
COPY backend/noise ./noise
# Optionally serve frontend from backend when enabled
COPY --from=frontend-build /app/frontend/dist /app/backend/public
# Ensure directories exist; images will be mounted as a volume
RUN mkdir -p /app/backend/images /app/backend/thumbnails

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/src/index.js"]

# -------- Frontend runtime image (Nginx) --------
FROM nginx:alpine AS frontend-runtime
# Copy built frontend assets
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
# Replace default nginx config with our proxy for /api
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 