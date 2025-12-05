#!/bin/sh
set -e

# Start virtual X server with WebGL/OpenGL support
# GLX extension enables OpenGL support for WebGL
# +render enables the render extension for hardware acceleration
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +extension RANDR +extension RENDER +render -noreset &
XVFB_PID=$!
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 2

# Set Mesa/OpenGL environment variables for WebGL support
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330
export EGL_PLATFORM=x11

# Verify Xvfb is running
if ! kill -0 $XVFB_PID 2>/dev/null; then
  echo "ERROR: Xvfb failed to start"
  exit 1
fi

# Optional: log for debugging
echo "Xvfb started on DISPLAY=${DISPLAY} with WebGL support enabled"
echo "Mesa configuration: LIBGL_ALWAYS_SOFTWARE=${LIBGL_ALWAYS_SOFTWARE}, GALLIUM_DRIVER=${GALLIUM_DRIVER}"

# Run the actual command (bun apps/sim/server.js)
exec "$@"
