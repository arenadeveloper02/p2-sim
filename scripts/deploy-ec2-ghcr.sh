SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-}"
IMAGE_TAG_ARG="${1:-}"
DEPLOY_BRANCH="${2:-${DEPLOY_BRANCH:-}}"

if [ -z "$IMAGE_TAG_ARG" ]; then
  echo "Usage: $0 <image-tag> [branch]" >&2
  echo "Example: $0 fix-prod-secrets-0.0.2 fix/prod-secrets" >&2
  exit 1
fi

if [ -z "$DEPLOY_ROOT" ]; then
  if [ -f "$PWD/docker-compose.test-env.yml" ]; then
    DEPLOY_ROOT="$PWD"
  elif [ -f /root/git/p2-sim/docker-compose.test-env.yml ]; then
    DEPLOY_ROOT=/root/git/p2-sim
  else
    DEPLOY_ROOT="$DEFAULT_DEPLOY_ROOT"
  fi
fi

if [ -n "$DEPLOY_BRANCH" ]; then
  if [ ! -d "$DEPLOY_ROOT/.git" ]; then
    echo "Git repository not found: $DEPLOY_ROOT" >&2
    echo "Set DEPLOY_ROOT=/path/to/p2-sim before passing a branch." >&2
    exit 1
  fi

  echo "Updating ${DEPLOY_ROOT} to branch ${DEPLOY_BRANCH}"
  cd "$DEPLOY_ROOT"
  git stash
  git fetch origin "$DEPLOY_BRANCH"
  git checkout "$DEPLOY_BRANCH"
  git pull --rebase origin "$DEPLOY_BRANCH"
fi

COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/docker-compose.test-env.yml}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  echo "Set DEPLOY_ROOT=/path/to/p2-sim, COMPOSE_FILE=/path/to/docker-compose.test-env.yml, or pass the branch as the second argument." >&2
  exit 1
fi

export IMAGE_TAG="${IMAGE_TAG:-$IMAGE_TAG_ARG}"

SIM_ENV_FILE="${DEPLOY_ROOT}/apps/sim/.env"
REALTIME_ENV_FILE="${DEPLOY_ROOT}/apps/realtime/.env"

if [ ! -f "$SIM_ENV_FILE" ]; then
  echo "Missing env file: $SIM_ENV_FILE" >&2
  echo "Copy apps/sim/.env.example to apps/sim/.env and configure it before deploying." >&2
  exit 1
fi

if [ ! -f "$REALTIME_ENV_FILE" ]; then
  echo "Missing env file: $REALTIME_ENV_FILE" >&2
  echo "Copy apps/realtime/.env.example to apps/realtime/.env and configure it before deploying." >&2
  exit 1
fi

COMPOSE_ENV_ARGS=(--env-file "$SIM_ENV_FILE")

GHCR_PASSWORD="${GHCR_TOKEN:-${CR_PAT:-}}"
if [ -n "$GHCR_PASSWORD" ]; then
  echo "$GHCR_PASSWORD" | docker login ghcr.io \
    --username "${GHCR_USERNAME:-arenadeveloper02}" \
    --password-stdin
fi

echo "Deploying IMAGE_TAG=${IMAGE_TAG}"
echo "Using compose file: ${COMPOSE_FILE}"

cd "$DEPLOY_ROOT"
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" pull simstudio realtime migrations
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" up -d --remove-orphans

deadline=$((SECONDS + ${DEPLOY_HEALTH_TIMEOUT_SECONDS:-240}))

until curl -fsS http://127.0.0.1:3002/health >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" ps
    docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" logs --tail=100 realtime
    exit 1
  fi
  sleep 5
done

until curl -fsS http://127.0.0.1:3000 >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" ps
    docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" logs --tail=100 simstudio
    exit 1
  fi
  sleep 5
done

docker image prune -f
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" ps
