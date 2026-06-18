#!/bin/sh
# Stop app → maintenance on 3000/3002 → pull + build → start app (no host ports) →
# wait for internal health → verify maintenance still serving → chained cutover (no force-recreate).
# Uses pre-built p2-sim-maintenance. RDS-backed: migrations skipped (docker-compose.deploy.yml).

set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <branch>" >&2
  exit 2
fi

log() {
  printf '[deploy] %s\n' "$1"
}

wait_for_http() {
  url="$1"
  label="$2"
  max_seconds="${3:-600}"
  elapsed=0

  log "Waiting for $label ($url)..."
  while ! curl -s -o /dev/null "$url" 2>/dev/null; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_seconds" ]; then
      log "ERROR: timed out after ${max_seconds}s waiting for $label"
      exit 1
    fi
    if [ $((elapsed % 30)) -eq 0 ]; then
      log "Still waiting for $label (${elapsed}s)..."
    fi
    sleep 1
  done
  log "$label is reachable"
}

wait_for_health() {
  url="$1"
  label="$2"
  max_seconds="${3:-600}"
  elapsed=0

  log "Waiting for $label health ($url)..."
  while ! wget -q --spider "$url" 2>/dev/null; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_seconds" ]; then
      log "ERROR: timed out after ${max_seconds}s waiting for $label health"
      exit 1
    fi
    if [ $((elapsed % 30)) -eq 0 ]; then
      log "Still waiting for $label health (${elapsed}s)..."
    fi
    sleep 1
  done
  log "$label is healthy"
}

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

log "Stopping app containers..."
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

log "Starting maintenance on :3000 and :3002..."
docker rm -f p2-sim-maintenance-sim p2-sim-maintenance-realtime 2>/dev/null || true
docker run -d --name p2-sim-maintenance-sim --restart no -p 3000:80 "$MAINTENANCE_IMAGE"
docker run -d --name p2-sim-maintenance-realtime --restart no -p 3002:80 "$MAINTENANCE_IMAGE"

wait_for_http "http://127.0.0.1:3000/" "maintenance (sim)" 60
wait_for_http "http://127.0.0.1:3002/" "maintenance (realtime)" 60

docker rmi -f "p2-sim-simstudio" 2>/dev/null || true
docker rmi -f "p2-sim-realtime" 2>/dev/null || true

log "Syncing branch $BRANCH..."
cd "$REPO_DIR"
git stash
git fetch
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

log "Building images (maintenance still serving users)..."
docker compose $COMPOSE up -d --build --no-start $DEPLOY_SERVICES

log "Starting stack without host ports; waiting for internal healthchecks..."
if docker compose up --help 2>/dev/null | grep -q -- '--wait-timeout'; then
  docker compose $COMPOSE $COMPOSE_NO_PORTS up -d --wait --wait-timeout 900 $DEPLOY_SERVICES
else
  docker compose $COMPOSE $COMPOSE_NO_PORTS up -d --wait $DEPLOY_SERVICES
fi
log "Internal healthchecks passed"

wait_for_http "http://127.0.0.1:3000/" "maintenance (sim)" 60
wait_for_http "http://127.0.0.1:3002/" "maintenance (realtime)" 60

log "Cutover: stopping maintenance and publishing app ports..."
docker stop p2-sim-maintenance-sim p2-sim-maintenance-realtime && \
  docker rm p2-sim-maintenance-sim p2-sim-maintenance-realtime && \
  docker compose $COMPOSE up -d simstudio realtime

wait_for_health "http://127.0.0.1:3000/api/health" "simstudio" 600
wait_for_health "http://127.0.0.1:3002/health" "realtime" 600

log "Deploy complete: $BRANCH"
log "Sim health:      http://127.0.0.1:3000/api/health"
log "Realtime health: http://127.0.0.1:3002/health"
