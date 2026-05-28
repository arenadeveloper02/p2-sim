#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.test-env.yml}"
DEPLOY_TARGET="${1:-}"

if [ -z "$DEPLOY_TARGET" ]; then
  echo "Usage: $0 <image-tag>" >&2
  echo "Example: $0 feat-ghcr-0.0.1" >&2
  exit 1
fi

export IMAGE_TAG="${IMAGE_TAG:-$DEPLOY_TARGET}"

if [ -n "${GHCR_TOKEN:-${CR_PAT:-}}" ]; then
  echo "${GHCR_TOKEN:-$CR_PAT}" | docker login ghcr.io \
    --username "${GHCR_USERNAME:-arenadeveloper02}" \
    --password-stdin
fi

echo "Deploying IMAGE_TAG=${IMAGE_TAG}"

docker compose -f "$COMPOSE_FILE" pull simstudio realtime migrations
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

deadline=$((SECONDS + ${DEPLOY_HEALTH_TIMEOUT_SECONDS:-240}))

until curl -fsS http://127.0.0.1:3002/health >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    docker compose -f "$COMPOSE_FILE" ps
    docker compose -f "$COMPOSE_FILE" logs --tail=100 realtime
    exit 1
  fi
  sleep 5
done

until curl -fsS http://127.0.0.1:3000 >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    docker compose -f "$COMPOSE_FILE" ps
    docker compose -f "$COMPOSE_FILE" logs --tail=100 simstudio
    exit 1
  fi
  sleep 5
done

docker image prune -f
docker compose -f "$COMPOSE_FILE" ps
