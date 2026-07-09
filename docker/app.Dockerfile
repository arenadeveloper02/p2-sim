# ========================================
# Base Stage: Debian-based Bun with Node.js 22
# ========================================
FROM oven/bun:1.3.13-slim AS base

# Install Node.js 22 and common dependencies once in base stage
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv make g++ curl ca-certificates bash ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# ========================================
# Pruner Stage: Emit a minimal monorepo subset that sim depends on
# ========================================
FROM base AS pruner
WORKDIR /app

RUN bun install -g turbo@2.9.6

COPY . .

RUN turbo prune sim --docker

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
WORKDIR /app

# Pruned manifests from the pruner stage. This layer only invalidates when
# package.json/bun.lock content changes — not on source edits.
COPY --from=pruner /app/out/json/ ./
# Use the full bun.lock (not the pruned out/bun.lock). turbo prune emits a
# bun.lock that bun 1.3.x rejects with "Failed to resolve prod dependency",
# forcing a slow fresh resolve. The full lockfile parses cleanly and bun
# only installs what the pruned package.jsons reference.
COPY --from=pruner /app/bun.lock ./bun.lock

# Install all dependencies (including devDependencies — tailwindcss/postcss are
# devDeps but required at build time). Then rebuild isolated-vm against Node.js.
# JOBS=4 caps node-gyp parallelism — higher values OOM isolated-vm (laverdet/isolated-vm#428).
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    --mount=type=cache,id=npm-cache,target=/root/.npm \
    HUSKY=0 bun install --ignore-scripts --linker=hoisted && \
    cd node_modules/isolated-vm && JOBS=4 npx node-gyp rebuild --release

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM base AS builder
ARG TARGETPLATFORM
WORKDIR /app

# Copy node_modules from deps stage (cached if dependencies don't change)
COPY --from=deps /app/node_modules ./node_modules

# Copy pruned source tree (apps/sim + workspace packages it depends on)
COPY --from=pruner /app/out/full/ ./

# Next.js 16 / Turbopack workspace-root detection looks for a lockfile next to
# the workspace package.json. Without it, `next build` fails with
# "couldn't find next/package.json from /app/apps/sim". turbo also warns
# "Lockfile not found at /app/bun.lock" without it.
COPY --from=pruner /app/bun.lock ./bun.lock

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

# Dummy values so next build can evaluate modules. Override at runtime.
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}

# Provide NEXT_PUBLIC_APP_URL for build-time module evaluation (auth, webhooks).
# CI passes the real URL via build-args; runtime env overrides at deploy time.
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Docker builders are memory-constrained (GH Actions ~7GB RAM). BuildKit's sandbox
# blocks swapon() without the security.insecure entitlement, which many CI setups
# don't (and shouldn't have to) grant. Instead of provisioning swap inside the
# build container, cap the heap via BUILD_MAX_OLD_SPACE_MB — package.json's
# `build` script reads this directly (defaults to 8192 if unset) and passes it
# to `next build` as NODE_OPTIONS itself, so set it here rather than NODE_OPTIONS
# directly (an ENV NODE_OPTIONS here would just get overridden by that script).
# Lower this further if the build still OOMs on your runner.
ENV BUILD_MAX_OLD_SPACE_MB=5120

# Per-platform cache id keeps arm64/amd64 SWC artifacts isolated.
RUN --mount=type=cache,id=next-cache-${TARGETPLATFORM},target=/app/apps/sim/.next/cache \
    --mount=type=cache,id=turbo-cache-${TARGETPLATFORM},target=/app/.turbo \
    bun run build

# ========================================
# Runner Stage: Run the actual app
# ========================================

FROM base AS runner
WORKDIR /app

# Node.js 22, Python, ffmpeg, etc. are already installed in base stage
ENV NODE_ENV=production

# ========================================
# Install Chrome + matching Chromedriver + git
# ========================================
# Chrome and Chromedriver versions are pinned together and installed from the
# same Google source. Previously Chrome came from Google's repo while
# chromedriver came from Debian's repo — those track independent version
# lineages (Chrome proper vs. Chromium) and drift out of sync, causing
# "This version of ChromeDriver only supports Chrome version X" failures at
# runtime. Update CHROME_VERSION below deliberately; don't let it float.
ARG CHROME_VERSION=127.0.6533.88
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    --mount=type=cache,id=chrome-dl,target=/tmp/chrome-dl \
    apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates git \
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
      unzip \
    && [ -f /tmp/chrome-dl/chrome-${CHROME_VERSION}.zip ] || wget -q \
         "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
         -O /tmp/chrome-dl/chrome-${CHROME_VERSION}.zip \
    && unzip -q /tmp/chrome-dl/chrome-${CHROME_VERSION}.zip -d /opt \
    && ln -s /opt/chrome-linux64/chrome /usr/bin/google-chrome \
    && [ -f /tmp/chrome-dl/chromedriver-${CHROME_VERSION}.zip ] || wget -q \
         "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chromedriver-linux64.zip" \
         -O /tmp/chrome-dl/chromedriver-${CHROME_VERSION}.zip \
    && unzip -q /tmp/chrome-dl/chromedriver-${CHROME_VERSION}.zip -d /opt \
    && ln -s /opt/chromedriver-linux64/chromedriver /usr/bin/chromedriver

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
# Copy application artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/public ./apps/sim/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/static ./apps/sim/.next/static

# Copy blog/author content for runtime filesystem reads (not part of the JS bundle)
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/content ./apps/sim/content

# Copy isolated-vm native module (compiled for Node.js in deps stage)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/isolated-vm ./node_modules/isolated-vm

# Copy the isolated-vm worker script
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/isolated-vm-worker.cjs ./apps/sim/lib/execution/isolated-vm-worker.cjs

# Copy the pre-built sandbox library bundles (pptxgenjs, docx, pdf-lib) that
# run inside the V8 isolate. Committed into the repo; see
# apps/sim/lib/execution/sandbox/bundles/build.ts to regenerate.
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/sandbox/bundles ./apps/sim/lib/execution/sandbox/bundles

# Guardrails setup with pip caching
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/requirements.txt ./apps/sim/lib/guardrails/requirements.txt
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/validate_pii.py ./apps/sim/lib/guardrails/validate_pii.py

# Install Python dependencies with pip cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv ./apps/sim/lib/guardrails/venv && \
    ./apps/sim/lib/guardrails/venv/bin/pip install --upgrade pip && \
    ./apps/sim/lib/guardrails/venv/bin/pip install -r ./apps/sim/lib/guardrails/requirements.txt && \
    chown -R nextjs:nodejs /app/apps/sim/lib/guardrails

# Create .next/cache directory with correct ownership
RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs apps/sim/.next/cache


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

CMD ["bun", "apps/sim/server.js"]