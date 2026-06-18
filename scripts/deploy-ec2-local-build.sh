#!/usr/bin/env bash
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

git stash
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

docker compose -f "$COMPOSE_FILE" -f "$LOCAL_BUILD_FILE" down --remove-orphans
docker image rm -f p2-sim-simstudio p2-sim-realtime p2-sim-migrations 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" -f "$LOCAL_BUILD_FILE" up -d --build --remove-orphans
docker image prune -f

cd ~
