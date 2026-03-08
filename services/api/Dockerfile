FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.6.1 --activate

# Copy workspace manifests for dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig ./packages/tsconfig
COPY packages/auth/package.json         ./packages/auth/package.json
COPY packages/billing/package.json      ./packages/billing/package.json
COPY packages/cache/package.json        ./packages/cache/package.json
COPY packages/db/package.json           ./packages/db/package.json
COPY packages/email/package.json         ./packages/email/package.json
COPY packages/events/package.json       ./packages/events/package.json
COPY packages/jobs/package.json         ./packages/jobs/package.json
COPY packages/nats/package.json         ./packages/nats/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/plans/package.json        ./packages/plans/package.json
COPY packages/search/package.json       ./packages/search/package.json
COPY packages/telemetry/package.json    ./packages/telemetry/package.json
COPY packages/usage/package.json        ./packages/usage/package.json
COPY packages/validation/package.json   ./packages/validation/package.json
COPY packages/vector/package.json       ./packages/vector/package.json
COPY services/api/package.json          ./services/api/package.json

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages ./packages
COPY services/api ./services/api

# Build packages in dependency order
RUN pnpm --filter @maschina/db build
RUN pnpm --filter @maschina/auth build
RUN pnpm --filter @maschina/cache build
RUN pnpm --filter @maschina/plans build
RUN pnpm --filter @maschina/events build
RUN pnpm --filter @maschina/nats build
RUN pnpm --filter @maschina/jobs build
RUN pnpm --filter @maschina/telemetry build
RUN pnpm --filter @maschina/usage build
RUN pnpm --filter @maschina/billing build
RUN pnpm --filter @maschina/notifications build
RUN pnpm --filter @maschina/validation build
RUN pnpm --filter @maschina/email build
RUN pnpm --filter @maschina/search build
RUN pnpm --filter @maschina/vector build
RUN pnpm --filter @maschina/api build

# Use pnpm deploy to produce a self-contained directory with all deps resolved
RUN pnpm --filter @maschina/api deploy --prod --legacy /app/deployed

# Copy built dist into the deploy output (pnpm deploy only copies src by default)
RUN cp -r /app/services/api/dist /app/deployed/dist

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/deployed .

EXPOSE 3000
CMD ["node", "dist/index.js"]
