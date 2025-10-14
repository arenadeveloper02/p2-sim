import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { figmaAIDesignWorkflowTool } from '../figma_ai_design_workflow'
import { FigmaPluginSQSService } from '../figma-plugin-sqs-service'
import { FigmaApi } from '../figma-api-client'

// Mock dependencies
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn()
  })),
  ReceiveMessageCommand: vi.fn(),
  DeleteMessageCommand: vi.fn(),
  SendMessageCommand: vi.fn()
}))

vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }))
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('Figma AI Design Workflow System', () => {
  let mockSQSClient: any
  let mockOpenAI: any
  let mockLogger: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.FIGMA_API_KEY = 'test-figma-key'
    process.env.FIGMA_SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
    
    mockSQSClient = {
      send: vi.fn()
    }
    
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }
    
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Figma AI Design Workflow Tool', () => {
    it('should generate design specification with ChatGPT-5', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              figmaNodes: [
                {
                  id: 'main-frame',
                  type: 'FRAME',
                  name: 'Landing Page',
                  children: []
                }
              ],
              designTokens: {
                colors: [
                  { name: 'Primary', value: '#007AFF' }
                ],
                typography: [
                  { name: 'Heading 1', fontSize: 32, fontWeight: 700 }
                ]
              },
              layoutStructure: {
                frames: [],
                components: []
              }
            })
          }
        }],
        usage: {
          total_tokens: 1500
        }
      }

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse)

      const params = {
        projectId: 'test-project',
        fileKey: 'test-file',
        aiPrompt: 'Create a modern landing page',
        designType: 'landing_page',
        brandGuidelines: 'Use blue and white colors',
        responsiveBreakpoints: ['mobile', 'tablet', 'desktop'],
        includeCode: true
      }

      const result = await figmaAIDesignWorkflowTool.transformResponse(
        { ok: true } as Response,
        params
      )

      expect(result.success).toBe(true)
      expect(result.output.designSpecification).toBeDefined()
      expect(result.output.sqsMessage).toBeDefined()
      expect(result.output.aiGeneration.model).toBe('gpt-5')
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('world-class UI/UX designer')
            }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Create a modern landing page')
            })
          ])
        })
      )
    })

    it('should handle ChatGPT-5 API errors gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('OpenAI API error')
      )

      const params = {
        projectId: 'test-project',
        fileKey: 'test-file',
        aiPrompt: 'Create a modern landing page'
      }

      await expect(
        figmaAIDesignWorkflowTool.transformResponse(
          { ok: true } as Response,
          params
        )
      ).rejects.toThrow('Figma AI Design Workflow failed')
    })

    it('should create fallback design specification when JSON parsing fails', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }],
        usage: {
          total_tokens: 1000
        }
      }

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse)

      const params = {
        projectId: 'test-project',
        fileKey: 'test-file',
        aiPrompt: 'Create a modern landing page'
      }

      const result = await figmaAIDesignWorkflowTool.transformResponse(
        { ok: true } as Response,
        params
      )

      expect(result.success).toBe(true)
      expect(result.output.designSpecification.figmaCompatibleDesign.nodes).toBeDefined()
      expect(result.output.designSpecification.figmaCompatibleDesign.metadata.fallback).toBe(true)
    })
  })

  describe('Figma Plugin SQS Service', () => {
    let sqsService: FigmaPluginSQSService

    beforeEach(() => {
      sqsService = new FigmaPluginSQSService({
        sqsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
        figmaApiKey: 'test-figma-key',
        pollIntervalMs: 1000,
        maxMessagesPerBatch: 5,
        visibilityTimeoutSeconds: 300,
        retryAttempts: 3
      })
    })

    it('should process valid SQS messages', async () => {
      const mockMessage = {
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: JSON.stringify({
          projectId: 'test-project',
          fileKey: 'test-file',
          designData: {
            figmaCompatibleDesign: {
              nodes: [{ id: 'test-node', type: 'FRAME', name: 'Test Frame' }],
              styles: [],
              variables: [],
              components: []
            },
            designTokens: {
              colors: [],
              typography: [],
              spacing: [],
              shadows: []
            },
            layoutStructure: {
              frames: [],
              components: [],
              responsiveVersions: {}
            }
          },
          metadata: {
            generatedAt: new Date().toISOString(),
            requestId: 'test-request-id',
            version: '1.0.0'
          }
        })
      }

      // Mock SQS receive response
      mockSQSClient.send.mockResolvedValueOnce({
        Messages: [mockMessage]
      })

      // Mock SQS delete response
      mockSQSClient.send.mockResolvedValueOnce({})

      // Mock Figma API calls
      const mockFigmaApi = {
        ensureFileExists: vi.fn().mockResolvedValue({ success: true }),
        createColorStyle: vi.fn().mockResolvedValue('color-style-id'),
        createTextStyle: vi.fn().mockResolvedValue('text-style-id'),
        createSpacingVariable: vi.fn().mockResolvedValue('spacing-var-id'),
        createEffectStyle: vi.fn().mockResolvedValue('effect-style-id'),
        createNode: vi.fn().mockResolvedValue('node-id'),
        createComponent: vi.fn().mockResolvedValue('component-id')
      }

      // Replace the figmaApi instance
      ;(sqsService as any).figmaApi = mockFigmaApi

      await sqsService.startProcessing()

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockSQSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
            MaxNumberOfMessages: 5
          })
        })
      )
    })

    it('should handle invalid message structure', async () => {
      const invalidMessage = {
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: JSON.stringify({
          // Missing required fields
          projectId: 'test-project'
        })
      }

      mockSQSClient.send.mockResolvedValueOnce({
        Messages: [invalidMessage]
      })

      mockSQSClient.send.mockResolvedValueOnce({}) // Delete message

      await sqsService.startProcessing()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should delete invalid message
      expect(mockSQSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
          })
        })
      )
    })

    it('should handle SQS errors gracefully', async () => {
      mockSQSClient.send.mockRejectedValue(new Error('SQS error'))

      await sqsService.startProcessing()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should not throw error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error receiving messages from SQS:',
        expect.any(Error)
      )
    })
  })

  describe('Figma API Client', () => {
    let figmaApi: FigmaApi

    beforeEach(() => {
      figmaApi = new FigmaApi('test-figma-key')
    })

    it('should validate API key', async () => {
      // Mock successful API call
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test-user' })
      })

      const isValid = await figmaApi.validateApiKey()
      expect(isValid).toBe(true)
    })

    it('should handle API key validation failure', async () => {
      // Mock failed API call
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      })

      const isValid = await figmaApi.validateApiKey()
      expect(isValid).toBe(false)
    })

    it('should get rate limit information', async () => {
      // Mock response with rate limit headers
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'X-RateLimit-Remaining') return '100'
            if (name === 'X-RateLimit-Reset') return '1640995200'
            return null
          }
        }
      })

      const rateLimitInfo = await figmaApi.getRateLimitInfo()
      expect(rateLimitInfo.remaining).toBe(100)
      expect(rateLimitInfo.reset).toBe(1640995200)
    })

    it('should create color style', async () => {
      const colorData = {
        name: 'Primary Blue',
        value: '#007AFF',
        description: 'Primary brand color'
      }

      const styleId = await figmaApi.createColorStyle('test-file', colorData)
      expect(styleId).toBeDefined()
      expect(typeof styleId).toBe('string')
    })

    it('should create text style', async () => {
      const typographyData = {
        name: 'Heading 1',
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 40
      }

      const styleId = await figmaApi.createTextStyle('test-file', typographyData)
      expect(styleId).toBeDefined()
      expect(typeof styleId).toBe('string')
    })

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid request' })
      })

      await expect(figmaApi.getFile('invalid-file')).rejects.toThrow(
        'Figma API error: 400 Bad Request. Invalid request'
      )
    })
  })

  describe('Integration Tests', () => {
    it('should complete full workflow from AI generation to Figma creation', async () => {
      // Mock ChatGPT-5 response
      const mockChatGPTResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              figmaNodes: [
                {
                  id: 'main-frame',
                  type: 'FRAME',
                  name: 'Landing Page',
                  children: []
                }
              ],
              designTokens: {
                colors: [
                  { name: 'Primary', value: '#007AFF' }
                ],
                typography: [
                  { name: 'Heading 1', fontSize: 32, fontWeight: 700 }
                ]
              },
              layoutStructure: {
                frames: [],
                components: []
              }
            })
          }
        }],
        usage: { total_tokens: 1500 }
      }

      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatGPTResponse)

      // Test workflow tool
      const workflowParams = {
        projectId: 'test-project',
        fileKey: 'test-file',
        aiPrompt: 'Create a modern landing page',
        designType: 'landing_page'
      }

      const workflowResult = await figmaAIDesignWorkflowTool.transformResponse(
        { ok: true } as Response,
        workflowParams
      )

      expect(workflowResult.success).toBe(true)
      expect(workflowResult.output.sqsMessage).toBeDefined()

      // Test SQS message processing
      const sqsService = new FigmaPluginSQSService({
        sqsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
        figmaApiKey: 'test-figma-key',
        pollIntervalMs: 1000,
        maxMessagesPerBatch: 5,
        visibilityTimeoutSeconds: 300,
        retryAttempts: 3
      })

      const mockMessage = {
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: JSON.stringify(workflowResult.output.sqsMessage.payload)
      }

      mockSQSClient.send.mockResolvedValueOnce({
        Messages: [mockMessage]
      })

      mockSQSClient.send.mockResolvedValueOnce({}) // Delete message

      // Mock Figma API
      const mockFigmaApi = {
        ensureFileExists: vi.fn().mockResolvedValue({ success: true }),
        createColorStyle: vi.fn().mockResolvedValue('color-style-id'),
        createTextStyle: vi.fn().mockResolvedValue('text-style-id'),
        createSpacingVariable: vi.fn().mockResolvedValue('spacing-var-id'),
        createEffectStyle: vi.fn().mockResolvedValue('effect-style-id'),
        createNode: vi.fn().mockResolvedValue('node-id'),
        createComponent: vi.fn().mockResolvedValue('component-id')
      }

      ;(sqsService as any).figmaApi = mockFigmaApi

      await sqsService.startProcessing()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the complete workflow
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled()
      expect(mockSQSClient.send).toHaveBeenCalled()
      expect(mockFigmaApi.ensureFileExists).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      )

      const figmaApi = new FigmaApi('test-key')
      
      await expect(figmaApi.getFile('test-file')).rejects.toThrow('Network timeout')
    })

    it('should handle malformed JSON responses', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Not valid JSON'
          }
        }],
        usage: { total_tokens: 1000 }
      }

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse)

      const params = {
        projectId: 'test-project',
        fileKey: 'test-file',
        aiPrompt: 'Create a design'
      }

      const result = await figmaAIDesignWorkflowTool.transformResponse(
        { ok: true } as Response,
        params
      )

      expect(result.success).toBe(true)
      expect(result.output.designSpecification.figmaCompatibleDesign.metadata.fallback).toBe(true)
    })

    it('should retry failed operations', async () => {
      const sqsService = new FigmaPluginSQSService({
        sqsQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
        figmaApiKey: 'test-figma-key',
        pollIntervalMs: 1000,
        maxMessagesPerBatch: 5,
        visibilityTimeoutSeconds: 300,
        retryAttempts: 3
      })

      const mockMessage = {
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: JSON.stringify({
          projectId: 'test-project',
          fileKey: 'test-file',
          designData: {
            figmaCompatibleDesign: { nodes: [] },
            designTokens: { colors: [] },
            layoutStructure: { frames: [] }
          },
          metadata: {
            generatedAt: new Date().toISOString(),
            requestId: 'test-request-id',
            version: '1.0.0'
          }
        })
      }

      // Mock SQS receive
      mockSQSClient.send.mockResolvedValueOnce({
        Messages: [mockMessage]
      })

      // Mock Figma API failure
      const mockFigmaApi = {
        ensureFileExists: vi.fn().mockRejectedValue(new Error('Figma API error'))
      }

      ;(sqsService as any).figmaApi = mockFigmaApi

      await sqsService.startProcessing()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should handle the error gracefully
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing message:'),
        expect.any(Error)
      )
    })
  })
})
