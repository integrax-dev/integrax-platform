FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ─── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
# Copy all package.json files for workspace resolution
COPY packages/*/package.json ./packages/
COPY connectors/sdk/typescript/package.json ./connectors/sdk/typescript/
COPY connectors/implementations/*/package.json ./connectors/implementations/
COPY services/control-plane/package.json ./services/control-plane/
COPY modules/*/package.json ./modules/
COPY workers/ts/package.json ./workers/ts/
COPY workflows/temporal/package.json ./workflows/temporal/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @integrax/control-plane... build 2>/dev/null || true

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
ENV START_SERVER=true

# Copy workspace manifest for resolution
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/control-plane ./services/control-plane
COPY --from=build /app/modules ./modules
COPY --from=build /app/connectors ./connectors
COPY --from=build /app/workflows/temporal ./workflows/temporal
COPY --from=build /app/workers/ts ./workers/ts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "services/control-plane/src/index.js"]
