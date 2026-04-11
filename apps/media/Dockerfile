# ─────────────────────────────────────────────────────────────────────────────
# CoESCD Media Service (Mediasoup SFU) — Multi-stage Dockerfile
#
# Mediasoup requires Python 3 + build tools (make, g++) for its native bindings.
# We install them in the build stage and discard them in production.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init wget \
  && rm -rf /var/lib/apt/lists/*

# Build-time dependencies — keep a full native toolchain available in case
# mediasoup cannot use the prebuilt worker for the current platform.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ pkg-config \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev && cp -R node_modules /prod_node_modules
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
# mediasoup worker binary is pre-built inside node_modules — copy as-is
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin coescd
COPY --from=build --chown=coescd:nodejs /app/dist ./dist
COPY --from=deps  --chown=coescd:nodejs /prod_node_modules ./node_modules
COPY --chown=coescd:nodejs package.json ./
USER coescd
# HTTP signaling API
EXPOSE 4002
# RTP/RTCP UDP range — must match mediasoup rtcMinPort/rtcMaxPort
EXPOSE 10000-10100/udp
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

FROM deps AS development
COPY . .
EXPOSE 4002
EXPOSE 10000-10100/udp
CMD ["npm", "run", "start:dev"]
