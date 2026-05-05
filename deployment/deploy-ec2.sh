#!/usr/bin/env bash
# Maintenance: nginx serves deployment/maintenance.html on 3000/3002 during build/pull.
# nginx-maintenance.conf preserves deep links (try_files → index.html) and returns 503 for
# /api/health so maintenance.html can poll until the real app is healthy, then resume the same route.
# After containers start, --wait blocks until simstudio + realtime pass healthchecks so the LB
# sees healthy targets as soon as possible (pair with deployment/docker-compose.deploy-health.yml).

COMPOSE="-f docker-compose.test-env.yml -f deployment/docker-compose.deploy-health.yml"

docker build -f /root/git/p2-sim/deployment/Dockerfile.maintenance -t p2-sim-maintenance /root/git/p2-sim/deployment

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

docker rmi -f "p2-sim-simstudio"
docker rmi -f "p2-sim-realtime"

docker rm -f p2-sim-maintenance-sim p2-sim-maintenance-realtime 2>/dev/null || true
docker run -d --name p2-sim-maintenance-sim --restart no -p 3000:80 p2-sim-maintenance
docker run -d --name p2-sim-maintenance-realtime --restart no -p 3002:80 p2-sim-maintenance

cd /root/git/p2-sim
git stash
git fetch
git checkout $1
git pull --rebase origin $1

# Build/create without starting: maintenance keeps answering on 3000/3002 during pulls/builds.
docker compose $COMPOSE up -d --build --no-start

docker stop p2-sim-maintenance-sim p2-sim-maintenance-realtime
docker rm p2-sim-maintenance-sim p2-sim-maintenance-realtime

# Start stack and wait until app + realtime are healthy (maintenance is already gone — keep image
# boot + healthchecks fast via docker-compose.deploy-health.yml to shorten any LB blip).
if docker compose up --help 2>/dev/null | grep -q -- '--wait-timeout'; then
  docker compose $COMPOSE up -d --wait --wait-timeout 900
else
  docker compose $COMPOSE up -d --wait
fi
cd ~
