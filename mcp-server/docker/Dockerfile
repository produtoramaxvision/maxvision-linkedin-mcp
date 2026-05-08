# syntax=docker/dockerfile:1.7

# ============================================================
# MaxVision LinkedIn MCP — multi-stage Dockerfile
# Compatível com:
#   - Docker Engine standalone (docker compose up)
#   - Docker Swarm (docker stack deploy)
#   - Portainer Stack (Compose ou Swarm mode)
#
# Stages:
#   1. base       — Node 20 + Python 3.12 + system deps
#   2. patchright — Chromium + Patchright cache pre-baked
#   3. deps       — pnpm install (Node) + pip install (Python)
#   4. build      — TypeScript build
#   5. runtime    — imagem final mínima
# ============================================================

# ---------- Stage 1: base ----------
FROM node:20-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        python3-pip \
        python3-venv \
        tini \
        # Patchright/Chromium runtime libs
        libnss3 \
        libnspr4 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libasound2 \
        libatspi2.0-0 \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-noto-cjk \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate

# ---------- Stage 2: patchright ----------
FROM base AS patchright

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN mkdir -p ${PLAYWRIGHT_BROWSERS_PATH} \
    && npm install -g patchright \
    && patchright install chromium --with-deps \
    && rm -rf /tmp/* /root/.npm

# ---------- Stage 3: deps ----------
FROM patchright AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY python/requirements.txt ./python/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r python/requirements.txt

ENV PATH=/opt/venv/bin:$PATH

# ---------- Stage 4: build ----------
FROM deps AS build

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN pnpm run build && pnpm prune --prod

# ---------- Stage 5: runtime ----------
FROM base AS runtime

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH=/opt/venv/bin:/pnpm:$PATH \
    PORT=3000 \
    METRICS_PORT=9090

# Não rodar como root
RUN groupadd --system --gid 1001 mcp \
    && useradd --system --uid 1001 --gid mcp --home-dir /app --shell /bin/bash mcp \
    && mkdir -p /app /var/data/profiles /var/data/screenshots /var/log/mcp \
    && chown -R mcp:mcp /app /var/data /var/log/mcp

WORKDIR /app

# Copiar artifacts dos stages anteriores
COPY --from=patchright --chown=mcp:mcp /ms-playwright /ms-playwright
COPY --from=deps      --chown=mcp:mcp /opt/venv /opt/venv
COPY --from=build     --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build     --chown=mcp:mcp /app/dist ./dist
COPY --from=build     --chown=mcp:mcp /app/scripts ./scripts
COPY --from=build     --chown=mcp:mcp /app/python ./python
COPY --chown=mcp:mcp package.json ./

USER mcp

EXPOSE 3000 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
