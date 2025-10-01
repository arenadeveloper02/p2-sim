# ========================================
# S3-Compatible Multi-Stage Dockerfile
# ========================================
FROM oven/bun:alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo globally
RUN bun install -g turbo

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages
COPY apps/sim/package.json ./apps/sim/package.json
COPY apps/docs/package.json ./apps/docs/package.json
COPY packages/ ./packages/

# Install all dependencies including dev dependencies for build
RUN bun install --ignore-scripts

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
RUN bun install --ignore-scripts

# Apply patches (e.g., pdf-parse debug disable) during Docker build
RUN bunx patch-package

# Required for standalone nextjs build
WORKDIR /app/apps/sim
RUN bun install sharp

# S3-specific environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1 \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    S3_BUCKET_NAME=${S3_BUCKET_NAME} \
    AWS_REGION=${AWS_REGION} \
    AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
    AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
    TURBOPACK=0

WORKDIR /app
# Temporarily modify the sim app's build script to not use turbopack
RUN sed -i 's/next build --turbopack/next build/g' apps/sim/package.json
# Build using turbo
RUN bun run build

# ========================================
# S3 Assets Upload Stage
# ========================================
FROM base AS s3-uploader
WORKDIR /app

# Install AWS CLI
RUN apk add --no-cache aws-cli

# Copy built assets
COPY --from=builder /app/apps/sim/.next/static ./static
COPY --from=builder /app/apps/sim/public ./public

# Create upload script
RUN echo '#!/bin/sh' > upload-to-s3.sh && \
    echo 'aws s3 sync ./static s3://${S3_BUCKET_NAME}/_next/static --delete' >> upload-to-s3.sh && \
    echo 'aws s3 sync ./public s3://${S3_BUCKET_NAME}/ --delete' >> upload-to-s3.sh && \
    chmod +x upload-to-s3.sh

# ========================================
# Runner Stage: Run the actual app
# ========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/apps/sim/.next/standalone ./
COPY --from=builder /app/apps/sim/.next/static ./apps/sim/.next/static

# Copy S3 uploader for runtime asset management
COPY --from=s3-uploader /app/upload-to-s3.sh ./upload-to-s3.sh

# Install AWS CLI in runner for asset management
RUN apk add --no-cache aws-cli

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

# Health check that works with S3
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["bun", "apps/sim/server.js"]
