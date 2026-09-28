#!/usr/bin/env bash
# Bakes a warm npm cache + baseline node_modules for the E2B Function template.
# Copy the output into the template image at:
#   /opt/sim/generated-app-npm-cache
#   /opt/sim/generated-app-node_modules
#
# Usage:
#   bun run --cwd apps/sim ../../scripts/bake-generated-app-e2b-deps.sh
#   # or:
#   bash apps/sim/scripts/bake-generated-app-e2b-deps.sh /tmp/sim-e2b-deps
set -euo pipefail

OUT_ROOT="${1:-/tmp/sim-generated-app-e2b-deps}"
CACHE_DIR="${OUT_ROOT}/generated-app-npm-cache"
MODULES_DIR="${OUT_ROOT}/generated-app-node_modules"
WORK_DIR="${OUT_ROOT}/workspace"

# Keep in sync with PINNED_* in apps/sim/lib/development/normalize-generated-app-files.ts
NEXT_VERSION="16.2.12"
REACT_VERSION="19.0.0"

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${CACHE_DIR}"

cat > "${WORK_DIR}/package.json" <<EOF
{
  "name": "sim-generated-app-baseline",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "start": "next start"
  },
  "dependencies": {
    "@prisma/client": "6.9.0",
    "next": "${NEXT_VERSION}",
    "react": "${REACT_VERSION}",
    "react-dom": "${REACT_VERSION}"
  },
  "devDependencies": {
    "@types/node": "22.13.10",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "autoprefixer": "10.4.21",
    "eslint": "9.28.0",
    "eslint-config-next": "${NEXT_VERSION}",
    "postcss": "8.5.3",
    "prisma": "6.9.0",
    "tailwindcss": "3.4.17",
    "typescript": "5.8.3"
  }
}
EOF

echo "Installing baseline deps into ${WORK_DIR} (cache → ${CACHE_DIR})..."
npm install --prefix "${WORK_DIR}" --include=dev --legacy-peer-deps --no-audit --no-fund --cache "${CACHE_DIR}"

rm -rf "${MODULES_DIR}"
cp -a "${WORK_DIR}/node_modules" "${MODULES_DIR}"

cat <<EOF

Done. Bake into the E2B Function template:

  ${CACHE_DIR}     → /opt/sim/generated-app-npm-cache
  ${MODULES_DIR}   → /opt/sim/generated-app-node_modules

Generated-app validation will seed from those paths when present, then run
incremental npm install. Session reuse already skips reinstall when package.json
is unchanged across typecheck/repair/build.
EOF
