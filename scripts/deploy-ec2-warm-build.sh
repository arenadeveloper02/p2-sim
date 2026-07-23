#!/usr/bin/env bash
set -euo pipefail

# Build and deploy Sim on EC2 with warm BuildKit and a high Node heap.
# Does NOT wipe images or BuildKit cache unless --fresh is passed.
#
# Usage:
#   ./scripts/deploy-ec2-warm-build.sh <branch> [--fresh]
#   ./scripts/deploy-ec2-warm-build.sh feat/my-branch
#   ./scripts/deploy-ec2-warm-build.sh feat/my-branch --fresh
#
# Env overrides:
#   DEPLOY_ROOT                 (default: /root/git/p2-sim)
#   COMPOSE_FILE                (default: docker-compose.test-env.yml)
#   LOCAL_BUILD_FILE            (default: docker-compose.local-build.yml)
#   BUILD_MAX_OLD_SPACE_MB      (default: ~75% of MemTotal, clamped 8192–24576)
#   BUILDER_NAME                (default: sim-builder)
#   NEXT_PUBLIC_APP_URL
#   DEPLOY_HEALTH_TIMEOUT_SECONDS (default: 300)

BRANCH=""
FRESH=0

for arg in "$@"; do
  case "$arg" in
    --fresh)
      FRESH=1
      ;;
    -h | --help)
      echo "Usage: $0 <branch> [--fresh]" >&2
      exit 0
      ;;
    *)
      if [ -z "$BRANCH" ]; then
        BRANCH="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        echo "Usage: $0 <branch> [--fresh]" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch> [--fresh]" >&2
  echo "Example: $0 fix/prod-secrets" >&2
  echo "         $0 fix/prod-secrets --fresh" >&2
  exit 1
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/root/git/p2-sim}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.test-env.yml}"
LOCAL_BUILD_FILE="${LOCAL_BUILD_FILE:-docker-compose.local-build.yml}"
BUILDER_NAME="${BUILDER_NAME:-sim-builder}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-300}"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

if [ -z "${BUILD_MAX_OLD_SPACE_MB:-}" ]; then
  if [ -r /proc/meminfo ]; then
    MEM_MB=$(awk '/MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)
    BUILD_MAX_OLD_SPACE_MB=$((MEM_MB * 75 / 100))
    if [ "$BUILD_MAX_OLD_SPACE_MB" -lt 8192 ]; then
      BUILD_MAX_OLD_SPACE_MB=8192
    fi
    if [ "$BUILD_MAX_OLD_SPACE_MB" -gt 24576 ]; then
      BUILD_MAX_OLD_SPACE_MB=24576
    fi
  else
    BUILD_MAX_OLD_SPACE_MB=16384
  fi
fi
export BUILD_MAX_OLD_SPACE_MB

echo "==> Deploy root:    ${DEPLOY_ROOT}"
echo "==> Branch:         ${BRANCH}"
echo "==> Fresh wipe:     ${FRESH}"
echo "==> Node heap (MB): ${BUILD_MAX_OLD_SPACE_MB}"
echo "==> BuildKit:       on (builder=${BUILDER_NAME})"

if [ ! -d "${DEPLOY_ROOT}/.git" ]; then
  echo "Git repository not found: ${DEPLOY_ROOT}" >&2
  echo "Set DEPLOY_ROOT=/path/to/p2-sim" >&2
  exit 1
fi

cd "$DEPLOY_ROOT"

SIM_ENV_FILE="${DEPLOY_ROOT}/apps/sim/.env"
REALTIME_ENV_FILE="${DEPLOY_ROOT}/apps/realtime/.env"

if [ ! -f "$SIM_ENV_FILE" ]; then
  echo "Missing env file: ${SIM_ENV_FILE}" >&2
  exit 1
fi

if [ ! -f "$REALTIME_ENV_FILE" ]; then
  echo "Missing env file: ${REALTIME_ENV_FILE}" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [ ! -f "$LOCAL_BUILD_FILE" ]; then
  echo "Local build overlay not found: ${LOCAL_BUILD_FILE}" >&2
  exit 1
fi

echo "==> Updating git to ${BRANCH}"
git stash || true
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  echo "==> Creating buildx builder: ${BUILDER_NAME}"
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
  docker buildx inspect --bootstrap >/dev/null
else
  docker buildx use "$BUILDER_NAME"
fi

COMPOSE=(docker compose --env-file "$SIM_ENV_FILE" -f "$COMPOSE_FILE" -f "$LOCAL_BUILD_FILE")

if [ "$FRESH" -eq 1 ]; then
  echo "==> --fresh: wiping containers, images, and BuildKit cache"
  "${COMPOSE[@]}" down --remove-orphans || true
  docker image rm -f p2-sim-simstudio p2-sim-realtime p2-sim-migrations 2>/dev/null || true
  docker buildx prune -af || true
  docker builder prune -af || true
else
  echo "==> Warm path: keeping BuildKit cache and existing images"
  "${COMPOSE[@]}" stop simstudio realtime migrations 2>/dev/null || true
fi

echo "==> Building simstudio realtime migrations"
"${COMPOSE[@]}" build \
  --build-arg "BUILD_MAX_OLD_SPACE_MB=${BUILD_MAX_OLD_SPACE_MB}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}" \
  simstudio realtime migrations

echo "==> Starting stack"
"${COMPOSE[@]}" up -d --remove-orphans

if [ "$FRESH" -eq 0 ]; then
  docker image prune -f >/dev/null || true
fi

deadline=$((SECONDS + HEALTH_TIMEOUT))

echo "==> Waiting for realtime http://127.0.0.1:3002/health"
until curl -fsS http://127.0.0.1:3002/health >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    "${COMPOSE[@]}" ps
    "${COMPOSE[@]}" logs --tail=100 realtime
    exit 1
  fi
  sleep 5
done

echo "==> Waiting for simstudio http://127.0.0.1:3000"
until curl -fsS http://127.0.0.1:3000 >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    "${COMPOSE[@]}" ps
    "${COMPOSE[@]}" logs --tail=100 simstudio
    exit 1
  fi
  sleep 5
done

echo "==> Deploy OK"
"${COMPOSE[@]}" ps
echo "==> BuildKit disk usage (top entries):"
docker buildx du 2>/dev/null | head -20 || true
