# ========================================
# Base Stage: Alpine Linux with Bun
# ========================================
FROM oven/bun:1.2.19-alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo globally
RUN bun install -g turbo

COPY package.json bun.lock ./
RUN mkdir -p apps
COPY apps/sim/package.json ./apps/sim/package.json

RUN bun install --omit dev --ignore-scripts

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM base AS builder
WORKDIR /app

# Install turbo globally in builder stage
RUN bun install -g turbo && bun install -g patch-package

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Installing with full context to prevent missing dependencies error
RUN bun install --omit dev --ignore-scripts

# Apply patches (e.g., pdf-parse debug disable) during Docker build
RUN bunx patch-package

# Required for standalone nextjs build
WORKDIR /app/apps/sim
RUN bun install sharp

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

WORKDIR /app
RUN bun run build

# ========================================
# Runner Stage: Run the actual app
# ========================================
FROM oven/bun:1.2.19 AS runner
WORKDIR /app

ENV NODE_ENV=production

# 🟢 Install Chromium + ChromeDriver inside the container
# Install Xvfb + Chrome dependencies + Google Chrome + Chromedriver
RUN apt-get update && apt-get install -y \
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

# (Optional, if any code reads these env vars)
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/ \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/apps/sim/public ./apps/sim/public
COPY --from=builder /app/apps/sim/.next/standalone ./
COPY --from=builder /app/apps/sim/.next/static ./apps/sim/.next/static

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

# 🔹 Add entrypoint that starts Xvfb and then the app
COPY ./docker/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "apps/sim/server.js"]