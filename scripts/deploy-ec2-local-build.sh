#!/usr/bin/env bash

BRANCH="${1:-}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/root/git/p2-sim}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.test-env.yml}"
LOCAL_BUILD_FILE="${LOCAL_BUILD_FILE:-docker-compose.local-build.yml}"

if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch>" >&2
  echo "Example: $0 fix/prod-secrets" >&2
  exit 1
fi

CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-simstudio")
docker stop $CONTAINERS
docker rm $CONTAINERS

CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-realtime")
docker stop $CONTAINERS
docker rm $CONTAINERS

docker rmi -f "p2-sim-simstudio"
docker rmi -f "p2-sim-realtime"

cd "$DEPLOY_ROOT"

SIM_ENV_FILE="${DEPLOY_ROOT}/apps/sim/.env"
if [ ! -f "$SIM_ENV_FILE" ]; then
  echo "Missing env file: $SIM_ENV_FILE" >&2
  exit 1
fi

COMPOSE_ENV_ARGS=(--env-file "$SIM_ENV_FILE")

git stash
git fetch
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

docker compose -f "$COMPOSE_FILE" -f "$LOCAL_BUILD_FILE" up -d --build

cd ~
