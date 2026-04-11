# =============================================================================
# CoESCD Map Client — Multi-stage Dockerfile
# Stage 1: build Vite + React app
# Stage 2: serve static assets with Nginx
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — builder
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .

# Inject runtime env via build args (baked into the static bundle)
ARG VITE_API_URL=/api
ARG VITE_TILE_URL=/tiles
ARG VITE_WS_URL=/ws

ENV VITE_API_URL=$VITE_API_URL \
    VITE_TILE_URL=$VITE_TILE_URL \
    VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — production Nginx server
# ---------------------------------------------------------------------------
FROM nginx:1.28.3-alpine AS production

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Serve the SPA: all routes fall back to index.html for client-side routing
COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/map-client.conf

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
