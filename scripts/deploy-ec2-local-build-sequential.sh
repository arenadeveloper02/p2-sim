#!/usr/bin/env bash
# Re-exec under bash if invoked as `sh script.sh` (dash has no pipefail).
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -euo pipefail

BRANCH="${1:-}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/root/git/p2-sim}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.test-env.yml}"
LOCAL_BUILD_FILE="${LOCAL_BUILD_FILE:-docker-compose.local-build.yml}"

if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch>" >&2
  echo "Example: $0 fix/prod-secrets" >&2
  exit 1
fi

cd "$DEPLOY_ROOT"

SIM_ENV_FILE="${DEPLOY_ROOT}/apps/sim/.env"
if [ ! -f "$SIM_ENV_FILE" ]; then
  echo "Missing env file: $SIM_ENV_FILE" >&2
  exit 1
fi

git stash
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

COMPOSE=(docker compose --env-file "$SIM_ENV_FILE" -f "$COMPOSE_FILE" -f "$LOCAL_BUILD_FILE")

"${COMPOSE[@]}" down --remove-orphans
docker image rm -f p2-sim-simstudio p2-sim-realtime p2-sim-migrations 2>/dev/null || true

# Build one service at a time to avoid parallel Bake OOM on ~32GB hosts.
echo "Building realtime..."
"${COMPOSE[@]}" build realtime

echo "Building simstudio..."
"${COMPOSE[@]}" build simstudio

echo "Building migrations..."
"${COMPOSE[@]}" build migrations

echo "Starting stack (no rebuild)..."
"${COMPOSE[@]}" up -d --no-build --remove-orphans

docker image prune -f

cd ~
