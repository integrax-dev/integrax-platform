FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo so workspace resolution inside Docker matches local development.
COPY . .

RUN pnpm install --frozen-lockfile

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/connectors ./connectors
COPY --from=base /app/packages ./packages
COPY --from=base /app/workflows ./workflows
COPY --from=base /app/workers/ts ./workers/ts

WORKDIR /app/workers/ts

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
