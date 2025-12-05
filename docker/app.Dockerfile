# ========================================
# Base Stage: Alpine Linux with Bun
# ========================================
FROM oven/bun:1.3.3-alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo globally (cached separately, changes infrequently)
RUN bun install -g turbo

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages/db
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json

# Install dependencies (this layer will be cached if package files don't change)
RUN bun install --omit dev --ignore-scripts

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM base AS builder
WORKDIR /app

# Install turbo globally (cached separately, changes infrequently)
RUN bun install -g turbo

# Copy node_modules from deps stage (cached if dependencies don't change)
COPY --from=deps /app/node_modules ./node_modules

# Copy package configuration files (needed for build)
COPY package.json bun.lock turbo.json ./
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json

# Copy workspace configuration files (needed for turbo)
COPY apps/sim/next.config.ts ./apps/sim/next.config.ts
COPY apps/sim/tsconfig.json ./apps/sim/tsconfig.json
COPY apps/sim/tailwind.config.ts ./apps/sim/tailwind.config.ts
COPY apps/sim/postcss.config.mjs ./apps/sim/postcss.config.mjs

# Copy source code (changes most frequently - placed last to maximize cache hits)
COPY apps/sim ./apps/sim
COPY packages ./packages

# Required for standalone nextjs build
WORKDIR /app/apps/sim
RUN bun install sharp

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

WORKDIR /app

# Provide dummy database URLs during image build so server code that imports @sim/db
# can be evaluated without crashing. Runtime environments should override these.
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}

# Provide dummy NEXT_PUBLIC_APP_URL for build-time evaluation
# Runtime environments should override this with the actual URL
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN bun run build

# ========================================
# Runner Stage: Run the actual app
# ========================================

FROM base AS runner
WORKDIR /app

# Install Python and dependencies for guardrails PII detection (cached separately)
# Also install ffmpeg for audio/video processing in STT
RUN apk add --no-cache python3 py3-pip bash ffmpeg

ENV NODE_ENV=production

# 🟢 Install Chromium + ChromeDriver inside the container
# Install Xvfb + Chrome dependencies + Chromium + ChromeDriver
RUN apk add --no-cache \
      chromium \
      xvfb \
      ttf-freefont \
      ttf-liberation \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-dejavu \
      gcompat \
      wget \
      unzip \
    && CHROMIUM_VERSION=$(chromium-browser --version 2>/dev/null || chromium --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1) \
    && CHROMEDRIVER_MAJOR=$(echo $CHROMIUM_VERSION | cut -d. -f1) \
    && CHROMEDRIVER_VERSION=$(wget -qO- "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json" 2>/dev/null | grep -oE '"version":"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' | head -1 | cut -d'"' -f4) \
    && if [ -z "$CHROMEDRIVER_VERSION" ]; then \
         CHROMEDRIVER_VERSION=$(wget -qO- "https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROMEDRIVER_MAJOR}" 2>/dev/null); \
       fi \
    && wget -q -O /tmp/chromedriver.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROMEDRIVER_VERSION}/linux64/chromedriver-linux64.zip" \
    && unzip -q /tmp/chromedriver.zip -d /tmp \
    && mv /tmp/chromedriver-linux64/chromedriver /usr/bin/chromedriver \
    && chmod +x /usr/bin/chromedriver \
    && rm -rf /tmp/chromedriver* /var/cache/apk/*

# (Optional, if any code reads these env vars)
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/ \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/apps/sim/public ./apps/sim/public
COPY --from=builder /app/apps/sim/.next/standalone ./
COPY --from=builder /app/apps/sim/.next/static ./apps/sim/.next/static

# Create non-root user and group (cached separately)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy application artifacts from builder (these change on every build)
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/public ./apps/sim/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/static ./apps/sim/.next/static

# Guardrails setup (files need to be owned by nextjs for runtime)
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/setup.sh ./apps/sim/lib/guardrails/setup.sh
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/requirements.txt ./apps/sim/lib/guardrails/requirements.txt
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/validate_pii.py ./apps/sim/lib/guardrails/validate_pii.py

# Run guardrails setup as root, then fix ownership of generated venv files
RUN chmod +x ./apps/sim/lib/guardrails/setup.sh && \
    cd ./apps/sim/lib/guardrails && \
    ./setup.sh && \
    chown -R nextjs:nodejs /app/apps/sim/lib/guardrails

# Create .next/cache directory with correct ownership
RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs /app

# 🔹 Add entrypoint that starts Xvfb and then the app
# Copy and set permissions before switching to non-root user
COPY --chmod=755 ./docker/docker-entrypoint.sh /entrypoint.sh

# Switch to non-root user
USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "apps/sim/server.js"]