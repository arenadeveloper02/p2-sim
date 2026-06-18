#!/bin/sh
# Uses pre-built p2-sim-maintenance on host 3000/3002 during git pull + image build.
# App/realtime start without host ports, pass healthchecks, then maintenance stops and ports publish.
# maintenance.html polls GET /api/health: 503 JSON while maintenance, 200 {status:ok} when app is live.

set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <branch>" >&2
  exit 2
fi

REPO_DIR="/root/git/p2-sim"
COMPOSE_BASE="-f docker-compose.test-env.yml"
COMPOSE_HEALTH="-f deployment/docker-compose.deploy-health.yml"
COMPOSE_NO_PORTS="-f deployment/docker-compose.deploy-no-ports.yml"
BRANCH="$1"
MAINTENANCE_IMAGE="p2-sim-maintenance"

if ! docker image inspect "$MAINTENANCE_IMAGE" >/dev/null 2>&1; then
  echo "Missing $MAINTENANCE_IMAGE — build once with:" >&2
  echo "  docker build -f $REPO_DIR/deployment/Dockerfile.maintenance -t p2-sim-maintenance $REPO_DIR/deployment" >&2
  exit 1
fi

docker rm -f p2-sim-maintenance-sim 2>/dev/null || true
CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-simstudio")
if [ -n "$CONTAINERS" ]; then
  docker stop $CONTAINERS
  docker rm $CONTAINERS
fi
docker run -d --name p2-sim-maintenance-sim --restart no -p 3000:80 "$MAINTENANCE_IMAGE"
docker rmi -f p2-sim-simstudio 2>/dev/null || true

docker rm -f p2-sim-maintenance-realtime 2>/dev/null || true
CONTAINERS=$(docker ps -a -q --filter ancestor="p2-sim-realtime")
if [ -n "$CONTAINERS" ]; then
  docker stop $CONTAINERS
  docker rm $CONTAINERS
fi
docker run -d --name p2-sim-maintenance-realtime --restart no -p 3002:80 "$MAINTENANCE_IMAGE"
docker rmi -f p2-sim-realtime 2>/dev/null || true

cd "$REPO_DIR"
git stash
git checkout "$BRANCH"
git fetch origin "$BRANCH"
git rebase "origin/$BRANCH"

docker compose $COMPOSE_BASE $COMPOSE_HEALTH up -d --build --no-start

if docker compose up --help 2>/dev/null | grep -q -- '--wait-timeout'; then
  docker compose $COMPOSE_BASE $COMPOSE_HEALTH $COMPOSE_NO_PORTS \
    up -d --wait --wait-timeout 900
else
  docker compose $COMPOSE_BASE $COMPOSE_HEALTH $COMPOSE_NO_PORTS \
    up -d --wait
fi

docker stop p2-sim-maintenance-sim p2-sim-maintenance-realtime
docker rm p2-sim-maintenance-sim p2-sim-maintenance-realtime

docker compose $COMPOSE_BASE $COMPOSE_HEALTH up -d --force-recreate simstudio realtime

until wget -q --spider http://127.0.0.1:3000/api/health; do sleep 2; done
until wget -q --spider http://127.0.0.1:3002/health; do sleep 2; done

cd ~
echo "Deploy complete: $BRANCH"
