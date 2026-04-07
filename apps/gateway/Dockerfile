# ─────────────────────────────────────────────────────────────────────────────
# CoESCD WebSocket Gateway — Multi-stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init wget \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev && cp -R node_modules /prod_node_modules
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin coescd
COPY --from=build --chown=coescd:nodejs /app/dist ./dist
COPY --from=deps  --chown=coescd:nodejs /prod_node_modules ./node_modules
COPY --chown=coescd:nodejs package.json ./
USER coescd
EXPOSE 4001
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

FROM deps AS development
COPY . .
EXPOSE 4001
CMD ["npm", "run", "start:dev"]
