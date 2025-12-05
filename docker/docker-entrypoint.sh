#!/bin/sh
set -e

# Start virtual X server with WebGL/OpenGL support
# GLX extension enables OpenGL support for WebGL
# +render enables the render extension for hardware acceleration
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +extension RANDR +extension RENDER +render -noreset &
export DISPLAY=:99

# Set Mesa/OpenGL environment variables for WebGL support
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330

# Optional: log for debugging
echo "Xvfb started on DISPLAY=${DISPLAY} with WebGL support enabled"

# Run the actual command (bun apps/sim/server.js)
exec "$@"
