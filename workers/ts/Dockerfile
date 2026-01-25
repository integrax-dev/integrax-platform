FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy package files for all workspaces
COPY connectors/sdk/typescript/package.json ./connectors/sdk/typescript/
COPY connectors/implementations/mercadopago/package.json ./connectors/implementations/mercadopago/
COPY connectors/implementations/google-sheets/package.json ./connectors/implementations/google-sheets/
COPY workers/ts/package.json ./workers/ts/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY connectors/sdk/typescript ./connectors/sdk/typescript
COPY connectors/implementations/mercadopago ./connectors/implementations/mercadopago
COPY connectors/implementations/google-sheets ./connectors/implementations/google-sheets
COPY workers/ts ./workers/ts

# Build all packages
RUN pnpm --filter @integrax/connector-sdk build && \
    pnpm --filter @integrax/connector-mercadopago build && \
    pnpm --filter @integrax/connector-google-sheets build && \
    pnpm --filter @integrax/worker build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/connectors ./connectors
COPY --from=base /app/workers/ts ./workers/ts

WORKDIR /app/workers/ts

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
