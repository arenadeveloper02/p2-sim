#!/bin/sh
set -e

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99

# Now start your app (Next.js + Bun)
exec "$@"
