# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM oven/bun:1.2.22-alpine AS deps
WORKDIR /app

# Copy only package files needed for migrations
COPY package.json bun.lock turbo.json ./
COPY apps/sim/package.json ./apps/sim/db/

# Install minimal dependencies in one layer
RUN bun install --omit dev --ignore-scripts && \
    bun install --omit dev --ignore-scripts drizzle-kit drizzle-orm postgres next-runtime-env zod @t3-oss/env-nextjs

# ========================================
# Runner Stage: Production Environment
# ========================================
FROM oven/bun:1.2.22-alpine AS runner
WORKDIR /app

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy only the necessary files from deps
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts
COPY --chown=nextjs:nodejs packages/db ./packages/db

# Switch to non-root user
USER nextjs

WORKDIR /app/apps/sim