FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/logger/package.json ./packages/logger/
COPY packages/health/package.json ./packages/health/
COPY workflows/temporal/package.json ./workflows/temporal/
COPY services/kafka-consumer/package.json ./services/kafka-consumer/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @integrax/kafka-consumer... build 2>/dev/null || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/workflows/temporal ./workflows/temporal
COPY --from=build /app/services/kafka-consumer ./services/kafka-consumer
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/package.json ./

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "services/kafka-consumer/src/index.js"]
