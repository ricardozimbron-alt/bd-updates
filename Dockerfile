FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/pnpm \
    PATH=/usr/local/pnpm:$PATH \
    PNPM_STORE_DIR=/usr/local/pnpm/store \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# ----- deps stage -----
FROM base AS deps
WORKDIR /app
# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc ./
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY lib ./lib
COPY worker ./worker
RUN --mount=type=cache,target=/usr/local/pnpm/store \
    pnpm install --frozen-lockfile=false

# ----- runtime stage -----
FROM base AS runtime
WORKDIR /app

# Install Chromium and the minimal libraries it needs to render headless. This
# is required by the ec-case-search adapter (the EC competition-cases SPA has
# no public API; only Playwright can fetch it). We point Playwright-core at
# the system chromium via PLAYWRIGHT_CHROMIUM_PATH below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       libasound2 \
       libnss3 \
       libgbm1 \
       libxshmfence1 \
       libxkbcommon0 \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium

COPY --from=deps /app /app
WORKDIR /app/worker
ENV WORKER_HEALTH_PORT=8080
EXPOSE 8080
CMD ["pnpm", "start"]
