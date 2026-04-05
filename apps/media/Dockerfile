# ─────────────────────────────────────────────────────────────────────────────
# CoESCD Media Service (Mediasoup SFU) — Multi-stage Dockerfile
#
# Mediasoup requires Python 3 + build tools (make, g++) for its native bindings.
# We install them in the build stage and discard them in production.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# Build-time dependencies — needed for mediasoup native bindings
FROM base AS deps
RUN apk add --no-cache python3 make g++ linux-headers
COPY package*.json ./
RUN npm install --only=production && cp -R node_modules /prod_node_modules
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
# mediasoup worker binary is pre-built inside node_modules — copy as-is
RUN addgroup -g 1001 -S nodejs && adduser -S coescd -u 1001 -G nodejs
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
