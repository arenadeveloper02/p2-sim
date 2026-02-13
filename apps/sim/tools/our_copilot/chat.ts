import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('OurCopilotTool')

export interface OurCopilotChatParams {
  message: string
  workflowId?: string
  preferences?: {
    llmProvider: 'anthropic' | 'openai'
    temperature: number
    maxTokens: number
    responseStyle: 'concise' | 'detailed' | 'friendly' | 'technical'
    autoExecuteTools: boolean
    showReasoning: boolean
  }
  stream?: boolean
}

export const ourCopilotChatTool: ToolConfig<OurCopilotChatParams, any> = {
  id: 'our_copilot_chat',
  version: '1.0.0',
  name: 'Our Copilot Chat',
  description:
    'Smart AI-powered copilot with tool integration, memory management, and learning capabilities. Uses Anthropic/OpenAI models to understand requests and execute tools.',
  params: {
    message: {
      type: 'string',
      description: 'Message to send to the copilot',
      required: true,
      visibility: 'user-or-llm',
    },
    workflowId: {
      type: 'string',
      description: 'Workflow ID for context',
      required: false,
      visibility: 'user-or-llm',
    },
    preferences: {
      type: 'object',
      description: 'User preferences for the copilot',
      required: false,
      visibility: 'user-or-llm',
    },
    stream: {
      type: 'boolean',
      description: 'Whether to stream the response',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: () => '/api/our-copilot/chat',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: OurCopilotChatParams) => ({
      message: params.message,
      workflowId: params.workflowId,
      preferences: params.preferences,
      stream: params.stream,
    }),
  },
  transformResponse: async (response: Response, params?: OurCopilotChatParams) => {
    try {
      logger.info('Processing Our Copilot response', {
        status: response.status,
        messageLength: params?.message?.length || 0,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Our Copilot API request failed', {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Our Copilot API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Our Copilot query successful', {
        success: data.success,
        hasToolCalls: !!data.toolCalls,
        toolCallsCount: data.toolCalls?.length || 0,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Our Copilot query execution failed', { 
        error, 
        message: params?.message?.substring(0, 100) 
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
