# ─────────────────────────────────────────────────────────────────────────────
# CoESCD WebSocket Gateway — Multi-stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

FROM base AS deps
COPY package*.json ./
RUN npm install --only=production && cp -R node_modules /prod_node_modules
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S coescd -u 1001 -G nodejs
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
