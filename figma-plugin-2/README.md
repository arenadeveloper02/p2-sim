# Figma Design Poller Plugin

A Figma plugin that continuously polls for design data every minute and automatically creates designs in Figma when new data is received.

## Features

- **1-minute polling interval**: Automatically checks for new design data every minute
- **Real-time design creation**: Creates designs in Figma as soon as data is received
- **Multiple design types**: Supports buttons, cards, forms, layouts, and components
- **Interactive UI**: Start/stop polling, clear designs, and view real-time status
- **SQS integration**: Ready to integrate with AWS SQS for production use
- **Comprehensive logging**: Track all plugin activities with timestamps

## Installation

1. Copy the plugin files to your Figma plugins directory
2. In Figma, go to Plugins → Development → Import plugin from manifest
3. Select the `manifest.json` file from this directory
4. The plugin will appear in your plugins list

## Usage

1. Open the plugin from the Figma plugins menu
2. The plugin will automatically start polling for design data
3. Use the control buttons to:
   - **Start Polling**: Begin checking for new design data
   - **Stop Polling**: Pause the polling process
   - **Clear Designs**: Remove all created designs from the current page

## Configuration

The plugin can be configured through environment variables or by modifying the config object in the code:

```javascript
const config = {
  pollIntervalMs: 60000, // 1 minute (in milliseconds)
  apiEndpoint: 'https://your-api-endpoint.com/api/sqs/poll',
  queueUrl: process.env.FIGMA_SQS_QUEUE_URL || '',
  region: process.env.AWS_REGION || 'us-west-2',
  maxMessages: 10,
  visibilityTimeout: 300,
}
```

## API Integration

To integrate with your actual API endpoint, modify the `pollForData()` method in `figma-polling-plugin.ts`:

```typescript
private async pollForData(): Promise<void> {
  try {
    this.logMessage('Polling for new design data...');
    this.updateLastPollTime();

    // Replace this with your actual API call
    const response = await fetch(this.config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queueUrl: this.config.queueUrl,
        region: this.config.region,
        maxMessages: this.config.maxMessages,
        visibilityTimeout: this.config.visibilityTimeout,
      }),
    });

    const data = await response.json();
    
    if (data.success && data.messages.length > 0) {
      this.logMessage(`Received ${data.messages.length} new design messages`);
      
      for (const message of data.messages) {
        const designData = JSON.parse(message.body);
        await this.createDesignInFigma(designData);
      }
    } else {
      this.logMessage('No new data available');
    }

    this.updateNextPollTime();
  } catch (error) {
    console.error('Error polling for data:', error);
    this.logMessage(`Error: ${error.message}`);
  }
}
```

## Design Data Format

The plugin expects design data in the following format:

```typescript
interface DesignData {
  id: string
  type: 'button' | 'card' | 'form' | 'layout' | 'component'
  title: string
  description?: string
  properties: {
    width?: number
    height?: number
    backgroundColor?: string
    textColor?: string
    borderRadius?: number
    padding?: number
    margin?: number
    fontSize?: number
    fontWeight?: number
    fontFamily?: string
  }
  content?: {
    text?: string
    icon?: string
    image?: string
  }
  children?: DesignData[]
  position?: {
    x: number
    y: number
  }
}
```

## Development

### Building the Plugin

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run dev

# Clean build files
npm run clean
```

### File Structure

```
figma-plugin-2/
├── figma-polling-plugin.ts    # Main plugin code (TypeScript)
├── code.js                    # Compiled JavaScript
├── ui.html                    # Plugin UI
├── manifest.json              # Plugin manifest
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Production Setup

For production use, you'll need to:

1. Set up your SQS queue with the appropriate permissions
2. Configure your API endpoint to handle polling requests
3. Update the `apiEndpoint` and `queueUrl` in the plugin configuration
4. Deploy the plugin to Figma's plugin directory or distribute it

## Troubleshooting

### Common Issues

1. **Plugin not starting**: Check that all files are in the correct location and the manifest.json is valid
2. **Polling not working**: Verify your API endpoint is accessible and returns the expected format
3. **Designs not creating**: Check the console for errors and ensure the design data format is correct

### Debug Mode

Enable debug logging by opening the browser console in Figma and looking for log messages from the plugin.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please open an issue in the repository or contact the development team.
