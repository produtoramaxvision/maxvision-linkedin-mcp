# syntax=docker/dockerfile:1.7

# ============================================================
# MaxVision LinkedIn MCP — multi-stage Dockerfile (Sprint 1)
#
# Build context: mcp-server/  (NOT repo root)
# Build:    docker buildx build -f mcp-server/docker/Dockerfile mcp-server/
# Multi-arch: linux/amd64 + linux/arm64 (CI workflow handles QEMU + buildx).
#
# Stages:
#   1. builder — pnpm install (frozen-lockfile), tsc build, prune dev deps.
#   2. runner  — minimal node:20-alpine runtime, non-root user, healthcheck.
#
# Sprint 1 scope: pure Node/TS surface (DB + Redis + HTTP transport).
# Patchright/Chromium and Python deps are excluded by design — they land in
# Sprint 2 (browser pool) and Sprint 3 (jobspy bridge).
# ============================================================

# ----- builder -----
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm via corepack (pinned version)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy lockfile + manifests first for cached install
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy sources
COPY tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

# Build TypeScript -> dist/
RUN pnpm run build

# Prune dev deps for runtime
RUN pnpm prune --prod --ignore-workspace

# ----- runner -----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_PORT=3000

# Non-root user (uid/gid 1001 to match common Docker conventions)
RUN addgroup -g 1001 -S app && \
    adduser -S -u 1001 -G app app && \
    chown -R app:app /app

USER app

# Copy built artifacts + minimal runtime
COPY --chown=app:app --from=builder /app/dist ./dist
COPY --chown=app:app --from=builder /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/drizzle ./drizzle
COPY --chown=app:app --from=builder /app/package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
