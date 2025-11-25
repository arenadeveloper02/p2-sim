#!/bin/sh
set -e

# Start virtual X server
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99

# Optional: log for debugging
echo "Xvfb started on DISPLAY=${DISPLAY}"

# Run the actual command (bun apps/sim/server.js)
exec "$@"
