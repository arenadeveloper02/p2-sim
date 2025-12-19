# ========================================
# Base Stage: Debian-based Bun
# ========================================
FROM oven/bun:1.3.3-slim AS base

# ========================================
# Dependencies Stage
# ========================================
FROM base AS deps
WORKDIR /app

# Install Node.js 22 for isolated-vm compilation (requires node-gyp and V8)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages/db
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json

# Install turbo globally, then dependencies, then rebuild isolated-vm for Node.js
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install -g turbo && \
    HUSKY=0 bun install --omit=dev --ignore-scripts && \
    cd $(readlink -f node_modules/isolated-vm) && npx node-gyp rebuild --release && cd /app

# ========================================
# Builder Stage (Next.js build)
# ========================================
FROM base AS builder
WORKDIR /app

RUN bun install -g turbo

# Copy node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copy config files
COPY package.json bun.lock turbo.json ./
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json

COPY apps/sim/next.config.ts ./apps/sim/next.config.ts
COPY apps/sim/tsconfig.json ./apps/sim/tsconfig.json
COPY apps/sim/tailwind.config.ts ./apps/sim/tailwind.config.ts
COPY apps/sim/postcss.config.mjs ./apps/sim/postcss.config.mjs

# Copy source
COPY apps/sim ./apps/sim
COPY packages ./packages

# Required for standalone build
WORKDIR /app/apps/sim
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    HUSKY=0 bun install sharp

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

WORKDIR /app

# Dummy build envs
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}

ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# 🔥 Build Next.js standalone
RUN bun run build


# ========================================
# Runner Stage (FINAL IMAGE)
# ========================================
FROM oven/bun:1.3.3 AS runner
WORKDIR /app

ENV NODE_ENV=production

# ========================================
# Install Python + Chrome + Chromedriver
# ========================================
RUN apt-get update && apt-get install -y \
      python3 python3-pip python3-venv bash ffmpeg \
      wget gnupg ca-certificates \
      xvfb \
      libnss3 \
      libxss1 \
      libasound2 \
      libx11-xcb1 \
      libxcomposite1 \
      libxrandr2 \
      libxdamage1 \
      libgbm1 \
      libgtk-3-0 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcairo2 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      fonts-liberation \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
         | gpg --dearmor > /usr/share/keyrings/google-linux.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
         > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y \
      google-chrome-stable \
      chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Environment variables for Chrome
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    CHROME_BIN=/usr/bin/google-chrome \
    CHROME_PATH=/usr/bin/google-chrome \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome


# ========================================
# Create non-root user
# ========================================
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nextjs


# ========================================
# Copy build artifacts from builder
# ========================================
# Install Node.js 22 (for isolated-vm worker) and other runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy application artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/public ./apps/sim/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/static ./apps/sim/.next/static

# Copy isolated-vm native module (compiled for Node.js in deps stage)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/isolated-vm ./node_modules/isolated-vm

# Copy the isolated-vm worker script
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/isolated-vm-worker.cjs ./apps/sim/lib/execution/isolated-vm-worker.cjs

# Guardrails setup (files need to be owned by nextjs for runtime)
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/setup.sh ./apps/sim/lib/guardrails/setup.sh
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/requirements.txt ./apps/sim/lib/guardrails/requirements.txt
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/validate_pii.py ./apps/sim/lib/guardrails/validate_pii.py


# ========================================
# Setup Guardrails Python VENV (NOW WORKS)
# ========================================
RUN chmod +x ./apps/sim/lib/guardrails/setup.sh && \
    cd ./apps/sim/lib/guardrails && \
    ./setup.sh && \
    chown -R nextjs:nodejs /app/apps/sim/lib/guardrails


# Create .next cache
RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs /app


# ========================================
# Entrypoint for Xvfb + app
# ========================================
COPY --chmod=755 ./docker/docker-entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]


# ========================================
# Run app as non-root
# ========================================
USER nextjs

EXPOSE 3000

ENV PORT=3000 \
    HOSTNAME="0.0.0.0"


# ========================================
# Start Bun server
# ========================================
CMD ["bun", "apps/sim/server.js"]
