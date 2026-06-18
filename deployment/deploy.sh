#!/bin/sh
# Stop app → maintenance on 3000/3002 → pull + build → start app (no host ports) →
# wait for /api/health + /health → stop maintenance → publish ports.
# Uses pre-built p2-sim-maintenance. RDS-backed: migrations skipped (docker-compose.deploy.yml).

set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <branch>" >&2
  exit 2
fi

BRANCH="$1"
REPO_DIR="/root/git/p2-sim"
MAINTENANCE_IMAGE="p2-sim-maintenance"
COMPOSE="-f docker-compose.test-env.yml -f deployment/docker-compose.deploy.yml -f deployment/docker-compose.deploy-health.yml"
COMPOSE_NO_PORTS="-f deployment/docker-compose.deploy-no-ports.yml"
DEPLOY_SERVICES="db realtime simstudio"

if ! docker image inspect "$MAINTENANCE_IMAGE" >/dev/null 2>&1; then
  echo "Missing $MAINTENANCE_IMAGE — build once with:" >&2
  echo "  docker build -f $REPO_DIR/deployment/Dockerfile.maintenance -t p2-sim-maintenance $REPO_DIR/deployment" >&2
  exit 1
fi

CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-simstudio")
if [ -n "$CONTAINERS" ]; then
  docker stop $CONTAINERS
  docker rm $CONTAINERS
fi

CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-realtime")
if [ -n "$CONTAINERS" ]; then
  docker stop $CONTAINERS
  docker rm $CONTAINERS
fi

docker rm -f p2-sim-maintenance-sim p2-sim-maintenance-realtime 2>/dev/null || true
docker run -d --name p2-sim-maintenance-sim --restart no -p 3000:80 "$MAINTENANCE_IMAGE"
docker run -d --name p2-sim-maintenance-realtime --restart no -p 3002:80 "$MAINTENANCE_IMAGE"

docker rmi -f "p2-sim-simstudio" 2>/dev/null || true
docker rmi -f "p2-sim-realtime" 2>/dev/null || true

cd "$REPO_DIR"
git stash
git fetch
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

docker compose $COMPOSE up -d --build --no-start $DEPLOY_SERVICES

if docker compose up --help 2>/dev/null | grep -q -- '--wait-timeout'; then
  docker compose $COMPOSE $COMPOSE_NO_PORTS up -d --wait --wait-timeout 900 $DEPLOY_SERVICES
else
  docker compose $COMPOSE $COMPOSE_NO_PORTS up -d --wait $DEPLOY_SERVICES
fi

docker stop p2-sim-maintenance-sim p2-sim-maintenance-realtime
docker rm p2-sim-maintenance-sim p2-sim-maintenance-realtime

docker compose $COMPOSE up -d --force-recreate simstudio realtime

until wget -q --spider http://127.0.0.1:3000/api/health; do sleep 2; done
until wget -q --spider http://127.0.0.1:3002/health; do sleep 2; done

cd ~
echo "Deploy complete: $BRANCH"
