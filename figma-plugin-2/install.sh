#!/bin/bash

# Figma Design Poller Plugin Installation Script

echo "🎨 Installing Figma Design Poller Plugin..."

# Check if we're on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    FIGMA_PLUGINS_DIR="$HOME/Library/Application Support/Figma/Plugins"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    FIGMA_PLUGINS_DIR="$HOME/.config/figma/Plugins"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    FIGMA_PLUGINS_DIR="$APPDATA/Figma/Plugins"
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

# Create plugins directory if it doesn't exist
mkdir -p "$FIGMA_PLUGINS_DIR"

# Create plugin directory
PLUGIN_DIR="$FIGMA_PLUGINS_DIR/figma-design-poller"
mkdir -p "$PLUGIN_DIR"

# Copy plugin files
echo "📁 Copying plugin files..."
cp figma-polling-plugin.ts "$PLUGIN_DIR/"
cp code.js "$PLUGIN_DIR/"
cp ui.html "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"
cp package.json "$PLUGIN_DIR/"
cp README.md "$PLUGIN_DIR/"

# Set permissions
chmod +x "$PLUGIN_DIR/code.js"

echo "✅ Plugin installed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Open Figma"
echo "2. Go to Plugins → Development → Import plugin from manifest"
echo "3. Select the manifest.json file from: $PLUGIN_DIR/manifest.json"
echo "4. The plugin will appear in your plugins list"
echo ""
echo "🔧 Configuration:"
echo "   - Update the API endpoint in the plugin code if needed"
echo "   - Set your SQS queue URL in the environment variables"
echo "   - Adjust the polling interval as needed"
echo ""
echo "📚 For more information, see: $PLUGIN_DIR/README.md"
