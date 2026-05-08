# syntax=docker/dockerfile:1.7

# ============================================================================
# MaxVision LinkedIn MCP — multi-stage Dockerfile (Sprint 1.5.3)
#
# Build context: REPO ROOT (NOT mcp-server/) — needed so we can COPY mcp-server/*
# Build local:   docker buildx build -f mcp-server/docker/Dockerfile .
# Multi-arch:    linux/amd64 + linux/arm64 (CI workflow handles QEMU + buildx).
#
# Sprint 1.5.3 adjusts to Patchright "Best Practice" anti-detect:
#   - launchPersistentContext per accountId (browser/pool.ts)
#   - headless: false via xvfb-run (LinkedIn detects headless Chrome)
#   - bundled Chromium (Google Chrome unavailable on linux/arm64)
#   - no custom UA / viewport (Patchright manages fingerprint)
#
# Image size: ~1.3 GB (Chromium ~400MB + xvfb + node_modules + Python jobspy).
#
# Stages:
#   1. builder — pnpm install (frozen-lockfile), tsc build, prune dev deps.
#   2. runner  — debian:bookworm-slim runtime, Chromium libs, xvfb, Python, non-root.
# ============================================================================

# ----- builder -----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    DEBIAN_FRONTEND=noninteractive

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Build deps for native modules (some pnpm deps need this)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node deps (manifests first for cached install)
COPY mcp-server/package.json mcp-server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build TypeScript
COPY mcp-server/tsconfig.json mcp-server/tsconfig.build.json mcp-server/drizzle.config.ts ./
COPY mcp-server/src ./src
COPY mcp-server/drizzle ./drizzle
COPY mcp-server/python ./python
RUN pnpm run build

# Prune dev deps for runtime
RUN pnpm prune --prod --ignore-workspace

# ----- runner -----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_PORT=3000 \
    DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    PROFILE_BASE_DIR=/data/profiles \
    DISPLAY=:99

# Install runtime deps:
#   - Chromium runtime libraries (Patchright/Playwright dependencies)
#   - Python 3 + pip + python-jobspy
#   - wget for healthcheck
#   - dumb-init for proper signal handling (PID 1)
#   - xvfb + xauth for virtual display (LinkedIn anti-bot detects headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget ca-certificates dumb-init \
        xvfb xauth \
        python3 python3-pip python3-venv \
        # Chromium runtime libs (Playwright canonical list)
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
        libatspi2.0-0 libxshmfence1 libgtk-3-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Install JobSpy (PEP 668: --break-system-packages on debian:bookworm)
# Note: python-jobspy doesn't expose __version__; import scrape_jobs as smoke test instead.
RUN pip3 install --no-cache-dir --break-system-packages python-jobspy==1.1.79 \
    && python3 -c "from jobspy import scrape_jobs; print('jobspy import OK')"

# pnpm + Patchright Chromium download
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/python ./python
COPY --from=builder /app/package.json ./

# Install Patchright browsers (Chromium ~400MB)
RUN npx --yes patchright install chromium \
    || npx --yes playwright install chromium

# Profile dir for Patchright launchPersistentContext per accountId.
# Mount as Docker volume in production stack so cookies/session persist
# across container restarts.
RUN mkdir -p /data/profiles

# Non-root user (uid 1001 to match docker conventions; debian default node uid=1000 conflicts)
RUN useradd -m -u 1001 -s /bin/bash app && \
    chown -R app:app /app /data/profiles && \
    mkdir -p /home/app/.cache && \
    if [ -d /root/.cache/ms-playwright ]; then \
        cp -r /root/.cache/ms-playwright /home/app/.cache/ms-playwright; \
    fi && \
    if [ -d /root/.cache/patchright ]; then \
        cp -r /root/.cache/patchright /home/app/.cache/patchright; \
    fi && \
    chown -R app:app /home/app/.cache

USER app

EXPOSE 3000

# 60s start period — Chromium first launch + xvfb startup is slow
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# dumb-init = PID 1 signal handling. xvfb-run wraps node so headless:false
# Patchright runs against virtual X display.
#  --auto-servernum picks a free :NN display (we hint :99 via DISPLAY env)
#  --server-args silences default error window + sets reasonable screen size
ENTRYPOINT ["dumb-init", "--"]
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1920x1080x24 -ac +extension GLX +render -noreset", "node", "dist/server.js"]
