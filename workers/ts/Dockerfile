FROM node:22-slim AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy package files for all workspaces
COPY connectors/sdk/typescript/package.json ./connectors/sdk/typescript/
COPY connectors/implementations/mercadopago/package.json ./connectors/implementations/mercadopago/
COPY connectors/implementations/google-sheets/package.json ./connectors/implementations/google-sheets/
COPY workers/ts/package.json ./workers/ts/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy source files
COPY connectors/sdk/typescript ./connectors/sdk/typescript
COPY connectors/implementations/mercadopago ./connectors/implementations/mercadopago
COPY connectors/implementations/google-sheets ./connectors/implementations/google-sheets
COPY workers/ts ./workers/ts

# Build stage — needs devDependencies (tsc)
FROM node:22-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY connectors/sdk/typescript/package.json ./connectors/sdk/typescript/
COPY connectors/implementations/mercadopago/package.json ./connectors/implementations/mercadopago/
COPY connectors/implementations/google-sheets/package.json ./connectors/implementations/google-sheets/
COPY workers/ts/package.json ./workers/ts/

RUN pnpm install --frozen-lockfile

COPY connectors/sdk/typescript ./connectors/sdk/typescript
COPY connectors/implementations/mercadopago ./connectors/implementations/mercadopago
COPY connectors/implementations/google-sheets ./connectors/implementations/google-sheets
COPY workers/ts ./workers/ts

RUN pnpm --filter @integrax/connector-sdk build && \
    pnpm --filter @integrax/connector-mercadopago build && \
    pnpm --filter @integrax/connector-google-sheets build && \
    pnpm --filter @integrax/worker build

# Production stage — distroless: no shell, no package manager, minimal attack surface
FROM gcr.io/distroless/nodejs22-debian12 AS production

WORKDIR /app

# Copy prod node_modules (no devDeps) + compiled output from build stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/connectors ./connectors
COPY --from=build /app/workers/ts/dist ./workers/ts/dist
COPY --from=build /app/workers/ts/package.json ./workers/ts/package.json

WORKDIR /app/workers/ts

ENV NODE_ENV=production

USER nonroot

CMD ["dist/index.js"]
