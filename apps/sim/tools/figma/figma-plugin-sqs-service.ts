import { createLogger } from '@/lib/logs/console/logger'
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs'
import { FigmaApi } from './figma-api-client'

const logger = createLogger('FigmaPluginSQSService')

export interface FigmaDesignMessage {
  messageId: string
  receiptHandle: string
  body: {
    projectId: string
    fileKey: string
    designData: {
      figmaCompatibleDesign: any
      designTokens: any
      layoutStructure: any
      specification: any
    }
    metadata: {
      generatedAt: string
      requestId: string
      version: string
    }
  }
}

export interface FigmaPluginConfig {
  sqsQueueUrl: string
  figmaApiKey: string
  pollIntervalMs: number
  maxMessagesPerBatch: number
  visibilityTimeoutSeconds: number
  retryAttempts: number
}

/**
 * Production-level Figma Plugin SQS Message Processor
 * 
 * This service processes SQS messages containing Figma design data
 * and creates the actual designs in Figma files.
 */
export class FigmaPluginSQSService {
  private sqsClient: SQSClient
  private figmaApi: FigmaApi
  private config: FigmaPluginConfig
  private isProcessing = false
  private processingInterval?: NodeJS.Timeout

  constructor(config: FigmaPluginConfig) {
    this.config = config
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    })
    this.figmaApi = new FigmaApi(config.figmaApiKey)
  }

  /**
   * Start processing SQS messages
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Figma plugin SQS processing is already running')
      return
    }

    this.isProcessing = true
    logger.info('Starting Figma plugin SQS message processing', {
      queueUrl: this.config.sqsQueueUrl,
      pollInterval: this.config.pollIntervalMs,
    })

    this.processingInterval = setInterval(async () => {
      try {
        await this.processMessages()
      } catch (error) {
        logger.error('Error processing SQS messages:', error)
      }
    }, this.config.pollIntervalMs)
  }

  /**
   * Stop processing SQS messages
   */
  async stopProcessing(): Promise<void> {
    if (!this.isProcessing) {
      return
    }

    this.isProcessing = false
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = undefined
    }

    logger.info('Stopped Figma plugin SQS message processing')
  }

  /**
   * Process messages from SQS queue
   */
  private async processMessages(): Promise<void> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.sqsQueueUrl,
        MaxNumberOfMessages: this.config.maxMessagesPerBatch,
        VisibilityTimeoutSeconds: this.config.visibilityTimeoutSeconds,
        WaitTimeSeconds: 5, // Long polling
        MessageAttributeNames: ['All'],
      })

      const response = await this.sqsClient.send(command)
      const messages = response.Messages || []

      if (messages.length === 0) {
        return
      }

      logger.debug(`Received ${messages.length} messages from SQS`)

      // Process messages in parallel
      const processingPromises = messages.map((message: any) => 
        this.processMessage(message).catch(error => {
          logger.error('Failed to process individual message:', error)
        })
      )

      await Promise.allSettled(processingPromises)
    } catch (error) {
      logger.error('Error receiving messages from SQS:', error)
    }
  }

  /**
   * Process individual SQS message
   */
  private async processMessage(message: any): Promise<void> {
    const requestId = message.MessageAttributes?.RequestId?.StringValue || 
                     `figma-plugin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    try {
      logger.info(`[${requestId}] Processing Figma design message`, {
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
      })

      // Parse message body
      const messageBody = JSON.parse(message.Body || '{}')
      const designMessage: FigmaDesignMessage = {
        messageId: message.MessageId || '',
        receiptHandle: message.ReceiptHandle || '',
        body: messageBody,
      }

      // Validate message structure
      if (!this.validateMessage(designMessage)) {
        logger.error(`[${requestId}] Invalid message structure`, { messageBody })
        await this.deleteMessage(designMessage.receiptHandle)
        return
      }

      // Create design in Figma
      const result = await this.createFigmaDesign(designMessage, requestId)

      if (result.success) {
        logger.info(`[${requestId}] Successfully created Figma design`, {
          projectId: designMessage.body.projectId,
          fileKey: designMessage.body.fileKey,
          nodeIds: result.nodeIds,
        })

        // Delete message after successful processing
        await this.deleteMessage(designMessage.receiptHandle)
      } else {
        logger.error(`[${requestId}] Failed to create Figma design`, {
          error: result.error,
          projectId: designMessage.body.projectId,
          fileKey: designMessage.body.fileKey,
        })

        // Handle retry logic or dead letter queue
        await this.handleProcessingFailure(designMessage, result.error || 'Unknown error', requestId)
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Error processing message:`, error)
      await this.handleProcessingFailure(message, error.message, requestId)
    }
  }

  /**
   * Validate SQS message structure
   */
  private validateMessage(message: FigmaDesignMessage): boolean {
    try {
      const { body } = message
      
      if (!body.projectId || !body.fileKey || !body.designData) {
        return false
      }

      if (!body.designData.figmaCompatibleDesign || 
          !body.designData.designTokens || 
          !body.designData.layoutStructure) {
        return false
      }

      return true
    } catch (error) {
      logger.error('Error validating message:', error)
      return false
    }
  }

  /**
   * Create design in Figma using the design data
   */
  private async createFigmaDesign(
    message: FigmaDesignMessage,
    requestId: string
  ): Promise<{ success: boolean; nodeIds?: string[]; error?: string }> {
    try {
      const { projectId, fileKey, designData } = message.body

      logger.debug(`[${requestId}] Creating Figma design`, {
        projectId,
        fileKey,
        designType: designData.specification?.metadata?.designType || 'unknown',
      })

      // Step 1: Create or update Figma file
      const fileResult = await this.figmaApi.ensureFileExists(fileKey, projectId)
      if (!fileResult.success) {
        return { success: false, error: `Failed to ensure file exists: ${fileResult.error}` }
      }

      // Step 2: Create design tokens (colors, typography, etc.)
      const tokensResult = await this.createDesignTokens(designData.designTokens, fileKey, requestId)
      if (!tokensResult.success) {
        logger.warn(`[${requestId}] Failed to create design tokens: ${tokensResult.error}`)
      }

      // Step 3: Create main design frames and components
      const designResult = await this.createDesignNodes(
        designData.figmaCompatibleDesign,
        designData.layoutStructure,
        fileKey,
        requestId
      )

      if (!designResult.success) {
        return { success: false, error: `Failed to create design nodes: ${designResult.error}` }
      }

      // Step 4: Create responsive versions if specified
      if (designData.layoutStructure.responsiveVersions) {
        await this.createResponsiveVersions(
          designData.layoutStructure.responsiveVersions,
          designResult.nodeIds || [],
          fileKey,
          requestId
        )
      }

      return {
        success: true,
        nodeIds: designResult.nodeIds,
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Error creating Figma design:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Create design tokens in Figma
   */
  private async createDesignTokens(
    designTokens: any,
    fileKey: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.debug(`[${requestId}] Creating design tokens`)

      // Create color styles
      if (designTokens.colors) {
        for (const color of designTokens.colors) {
          await this.figmaApi.createColorStyle(fileKey, color)
        }
      }

      // Create typography styles
      if (designTokens.typography) {
        for (const typography of designTokens.typography) {
          await this.figmaApi.createTextStyle(fileKey, typography)
        }
      }

      // Create spacing variables
      if (designTokens.spacing) {
        for (const spacing of designTokens.spacing) {
          await this.figmaApi.createSpacingVariable(fileKey, spacing)
        }
      }

      // Create shadow styles
      if (designTokens.shadows) {
        for (const shadow of designTokens.shadows) {
          await this.figmaApi.createEffectStyle(fileKey, shadow)
        }
      }

      return { success: true }
    } catch (error: any) {
      logger.error(`[${requestId}] Error creating design tokens:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Create design nodes in Figma
   */
  private async createDesignNodes(
    figmaDesign: any,
    layoutStructure: any,
    fileKey: string,
    requestId: string
  ): Promise<{ success: boolean; nodeIds?: string[]; error?: string }> {
    try {
      logger.debug(`[${requestId}] Creating design nodes`)

      const nodeIds: string[] = []

      // Create main frames
      if (figmaDesign.nodes) {
        for (const node of figmaDesign.nodes) {
          const nodeId = await this.figmaApi.createNode(fileKey, node)
          if (nodeId) {
            nodeIds.push(nodeId)
          }
        }
      }

      // Create components
      if (figmaDesign.components) {
        for (const component of figmaDesign.components) {
          const componentId = await this.figmaApi.createComponent(fileKey, component)
          if (componentId) {
            nodeIds.push(componentId)
          }
        }
      }

      return { success: true, nodeIds }
    } catch (error: any) {
      logger.error(`[${requestId}] Error creating design nodes:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Create responsive versions of the design
   */
  private async createResponsiveVersions(
    responsiveVersions: any,
    baseNodeIds: string[],
    fileKey: string,
    requestId: string
  ): Promise<void> {
    try {
      logger.debug(`[${requestId}] Creating responsive versions`)

      for (const [breakpoint, config] of Object.entries(responsiveVersions)) {
        logger.debug(`[${requestId}] Creating ${breakpoint} version`, { config })
        
        // Create responsive frame for each breakpoint
        const responsiveFrame = {
          type: 'FRAME',
          name: `${breakpoint.toUpperCase()} Version`,
          layoutMode: 'VERTICAL',
          ...(typeof config === 'object' && config !== null ? config : {}),
        }

        await this.figmaApi.createNode(fileKey, responsiveFrame)
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Error creating responsive versions:`, error)
    }
  }

  /**
   * Delete processed message from SQS
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.config.sqsQueueUrl,
        ReceiptHandle: receiptHandle,
      })

      await this.sqsClient.send(command)
      logger.debug('Successfully deleted message from SQS')
    } catch (error) {
      logger.error('Error deleting message from SQS:', error)
    }
  }

  /**
   * Handle processing failure with retry logic
   */
  private async handleProcessingFailure(
    message: any,
    error: string,
    requestId: string
  ): Promise<void> {
    logger.error(`[${requestId}] Handling processing failure:`, { error })

    // In production, you might want to:
    // 1. Send to dead letter queue
    // 2. Implement exponential backoff
    // 3. Send notification to monitoring system
    // 4. Log to error tracking service

    // For now, we'll just delete the message to prevent infinite retries
    if (message.receiptHandle) {
      await this.deleteMessage(message.receiptHandle)
    }
  }

  /**
   * Send status update to monitoring system
   */
  private async sendStatusUpdate(
    status: 'processing' | 'success' | 'error',
    messageId: string,
    requestId: string,
    details?: any
  ): Promise<void> {
    try {
      // In production, you would send this to your monitoring system
      // For example: CloudWatch, DataDog, New Relic, etc.
      
      const statusMessage = {
        status,
        messageId,
        requestId,
        timestamp: new Date().toISOString(),
        details,
      }

      logger.info(`[${requestId}] Status update:`, statusMessage)
    } catch (error) {
      logger.error(`[${requestId}] Error sending status update:`, error)
    }
  }
}

/**
 * Initialize and start the Figma plugin SQS service
 */
export async function initializeFigmaPluginSQSService(): Promise<FigmaPluginSQSService> {
  const config: FigmaPluginConfig = {
    sqsQueueUrl: process.env.FIGMA_SQS_QUEUE_URL || '',
    figmaApiKey: process.env.FIGMA_API_KEY || '',
    pollIntervalMs: parseInt(process.env.FIGMA_POLL_INTERVAL_MS || '5000'),
    maxMessagesPerBatch: parseInt(process.env.FIGMA_MAX_MESSAGES_PER_BATCH || '10'),
    visibilityTimeoutSeconds: parseInt(process.env.FIGMA_VISIBILITY_TIMEOUT_SECONDS || '300'),
    retryAttempts: parseInt(process.env.FIGMA_RETRY_ATTEMPTS || '3'),
  }

  const service = new FigmaPluginSQSService(config)
  await service.startProcessing()

  return service
}

/**
 * Graceful shutdown handler
 */
export async function shutdownFigmaPluginSQSService(service: FigmaPluginSQSService): Promise<void> {
  logger.info('Shutting down Figma plugin SQS service')
  await service.stopProcessing()
}
