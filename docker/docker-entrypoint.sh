# 1. Install Xvfb (if not already)
apk add --no-cache xvfb

# 2. Start Xvfb on display :99
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &

# 3. Export DISPLAY so Chromium/Selenium can see it
export DISPLAY=:99

# 4. Confirm
echo $DISPLAY
# should print: :99
