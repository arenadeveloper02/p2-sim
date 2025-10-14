# Figma AI Design Plugin System

A production-level system that integrates ChatGPT-5 with Figma to automatically generate and create designs through SQS message processing.

## 🏗️ Architecture Overview

The system consists of three main components:

1. **Figma AI Design Workflow Tool** - Generates designs using ChatGPT-5 and sends to SQS
2. **SQS Message Processing Service** - Processes messages and creates designs in Figma
3. **Figma Plugin** - Runs inside Figma to receive and process design data

## 📋 System Components

### 1. Figma AI Design Workflow Tool
**Location**: `apps/sim/tools/figma/figma_ai_design_workflow.ts`

**Features**:
- Integrates with ChatGPT-5 for design generation
- Creates Figma-compatible design specifications
- Generates design tokens (colors, typography, spacing, shadows)
- Creates responsive layouts
- Sends design data to SQS for plugin processing

**Input Parameters**:
- `projectId`: Figma project ID
- `fileKey`: Figma file key
- `aiPrompt`: Detailed AI prompt for design generation
- `designType`: Type of design (landing_page, ui_components, wireframe, full_website)
- `brandGuidelines`: Optional brand guidelines
- `responsiveBreakpoints`: Responsive breakpoints
- `includeCode`: Whether to include generated code

### 2. SQS Message Processing Service
**Location**: `apps/sim/tools/figma/figma-plugin-sqs-service.ts`

**Features**:
- Processes SQS messages containing design data
- Creates designs in Figma using the API client
- Handles retry logic and error management
- Supports concurrent message processing
- Comprehensive logging and monitoring

**Configuration**:
- `sqsQueueUrl`: SQS queue URL
- `figmaApiKey`: Figma API key
- `pollIntervalMs`: Polling interval
- `maxMessagesPerBatch`: Batch size
- `visibilityTimeoutSeconds`: Message visibility timeout
- `retryAttempts`: Maximum retry attempts

### 3. Figma API Client
**Location**: `apps/sim/tools/figma/figma-api-client.ts`

**Features**:
- Comprehensive Figma API integration
- Creates styles, variables, and components
- Handles file operations and node creation
- Supports responsive design creation
- Error handling and rate limiting

### 4. Figma Plugin
**Location**: `figma-plugin/`

**Files**:
- `figma-ai-design-plugin.ts`: Main plugin code
- `manifest.json`: Plugin configuration
- `ui.html`: Plugin user interface

**Features**:
- Processes design data from SQS
- Creates Figma nodes, styles, and components
- Responsive design support
- Real-time status updates
- Comprehensive error handling

## 🚀 Getting Started

### Prerequisites

1. **Figma API Key**: Get from Figma account settings
2. **AWS SQS Queue**: Set up SQS queue for message processing
3. **OpenAI API Key**: For ChatGPT-5 integration
4. **Figma Plugin**: Install the plugin in Figma

### Environment Variables

```bash
# Required
FIGMA_API_KEY=your_figma_api_key
OPENAI_API_KEY=your_openai_api_key
FIGMA_SQS_QUEUE_URL=your_sqs_queue_url

# Optional
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
FIGMA_POLL_INTERVAL_MS=5000
FIGMA_MAX_MESSAGES_PER_BATCH=10
FIGMA_VISIBILITY_TIMEOUT_SECONDS=300
FIGMA_RETRY_ATTEMPTS=3
```

### Installation

1. **Install Dependencies**:
   ```bash
   npm install @aws-sdk/client-sqs openai
   ```

2. **Set up SQS Queue**:
   ```bash
   aws sqs create-queue --queue-name figma-design-queue
   ```

3. **Install Figma Plugin**:
   - Copy plugin files to Figma plugins directory
   - Restart Figma
   - Enable the plugin

4. **Configure Plugin**:
   - Open plugin in Figma
   - Enter SQS queue URL and AWS region
   - Save settings

## 🔧 Usage

### 1. Using the Workflow Tool

```typescript
// Example workflow configuration
{
  "operation": "figma_ai_design_workflow",
  "projectId": "your_project_id",
  "fileKey": "your_file_key",
  "aiPrompt": "Create a modern landing page with hero section, features, and footer",
  "designType": "landing_page",
  "brandGuidelines": "Use blue and white colors, modern typography",
  "responsiveBreakpoints": "mobile, tablet, desktop",
  "includeCode": true
}
```

### 2. SQS Message Format

```json
{
  "projectId": "string",
  "fileKey": "string",
  "designData": {
    "figmaCompatibleDesign": {
      "nodes": [...],
      "styles": [...],
      "variables": [...],
      "components": [...]
    },
    "designTokens": {
      "colors": [...],
      "typography": [...],
      "spacing": [...],
      "shadows": [...]
    },
    "layoutStructure": {
      "frames": [...],
      "components": [...],
      "responsiveVersions": {...}
    }
  },
  "metadata": {
    "generatedAt": "2024-01-01T00:00:00.000Z",
    "requestId": "string",
    "version": "1.0.0"
  }
}
```

### 3. Plugin Operation

The plugin automatically:
1. Polls SQS for new messages
2. Processes design data
3. Creates Figma nodes and styles
4. Handles errors and retries
5. Updates status in real-time

## 🛠️ Development

### Project Structure

```
figma-plugin/
├── figma-ai-design-plugin.ts    # Main plugin code
├── manifest.json                # Plugin configuration
├── ui.html                      # Plugin UI
└── README.md                    # This file

apps/sim/tools/figma/
├── figma_ai_design_workflow.ts  # Workflow tool
├── figma-plugin-sqs-service.ts  # SQS service
├── figma-api-client.ts          # API client
└── index.ts                     # Exports
```

### Building the Plugin

1. **Compile TypeScript**:
   ```bash
   npx tsc figma-ai-design-plugin.ts --target es2017 --module commonjs
   ```

2. **Package Plugin**:
   ```bash
   zip -r figma-ai-design-plugin.zip manifest.json code.js ui.html
   ```

### Testing

1. **Unit Tests**:
   ```bash
   npm test figma-ai-design-workflow.test.ts
   ```

2. **Integration Tests**:
   ```bash
   npm test figma-plugin-integration.test.ts
   ```

3. **Plugin Testing**:
   - Install plugin in Figma
   - Test with sample SQS messages
   - Verify design creation

## 📊 Monitoring and Logging

### Logging Levels

- **INFO**: Normal operations and status updates
- **DEBUG**: Detailed processing information
- **WARN**: Non-critical issues and fallbacks
- **ERROR**: Critical failures and exceptions

### Metrics

- Message processing rate
- Success/failure rates
- Processing time
- Queue depth
- Error rates by type

### Health Checks

- SQS connectivity
- Figma API availability
- Plugin status
- Queue processing status

## 🔒 Security

### API Keys

- Store securely in environment variables
- Use AWS IAM roles when possible
- Rotate keys regularly
- Monitor usage

### SQS Security

- Use IAM policies for access control
- Enable encryption in transit
- Use dead letter queues for failed messages
- Monitor access logs

### Figma Plugin

- Validate all input data
- Sanitize user inputs
- Handle errors gracefully
- Log security events

## 🚨 Troubleshooting

### Common Issues

1. **SQS Connection Issues**:
   - Check AWS credentials
   - Verify queue URL
   - Check network connectivity

2. **Figma API Errors**:
   - Verify API key
   - Check rate limits
   - Validate file permissions

3. **Plugin Not Processing**:
   - Check plugin status
   - Verify SQS configuration
   - Check error logs

### Debug Mode

Enable debug logging:
```bash
export DEBUG=figma-plugin:*
```

### Support

- Check logs for detailed error information
- Verify all environment variables
- Test with minimal configuration
- Contact support with error details

## 📈 Performance Optimization

### SQS Optimization

- Use long polling
- Batch message processing
- Optimize message size
- Use dead letter queues

### Figma API Optimization

- Batch API calls
- Cache responses
- Use appropriate timeouts
- Handle rate limits

### Plugin Optimization

- Process messages in parallel
- Use efficient data structures
- Minimize DOM operations
- Optimize memory usage

## 🔄 Updates and Maintenance

### Version Management

- Semantic versioning
- Backward compatibility
- Migration scripts
- Rollback procedures

### Regular Maintenance

- Update dependencies
- Monitor performance
- Review logs
- Update documentation

## 📚 API Reference

### Figma AI Design Workflow Tool

```typescript
interface FigmaAIDesignWorkflowParams {
  projectId: string
  fileKey: string
  aiPrompt: string
  designType?: 'landing_page' | 'ui_components' | 'wireframe' | 'full_website'
  brandGuidelines?: string
  responsiveBreakpoints?: string[]
  includeCode?: boolean
}
```

### SQS Service Configuration

```typescript
interface FigmaPluginConfig {
  sqsQueueUrl: string
  figmaApiKey: string
  pollIntervalMs: number
  maxMessagesPerBatch: number
  visibilityTimeoutSeconds: number
  retryAttempts: number
}
```

### Plugin API

```typescript
class FigmaAIDesignPlugin {
  processQueue(): Promise<void>
  addToQueue(designData: any): void
  clearQueue(): void
  updateStatus(text: string, status: string): void
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Figma for the excellent API and plugin system
- OpenAI for ChatGPT-5 capabilities
- AWS for SQS infrastructure
- The open-source community for inspiration and tools
