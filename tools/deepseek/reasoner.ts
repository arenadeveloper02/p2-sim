import { ToolConfig, ToolResponse } from '../types'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatParams {
  apiKey: string
  systemPrompt?: string
  context?: string
  model?: string
  temperature?: number
}

interface ChatResponse extends ToolResponse {
  tokens?: number
  model: string
  reasoning_content?: string
}

export const reasonerTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'deepseek.reasoner',
  name: 'DeepSeek Reasoner',
  description: 'Chat with DeepSeek-R1 reasoning model',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'DeepSeek API key'
    },
    systemPrompt: {
      type: 'string',
      required: false,
      description: 'System prompt to guide the model'
    },
    context: {
      type: 'string',
      required: false,
      description: 'User input context'
    },
    model: {
      type: 'string',
      default: 'deepseek-reasoner',
      description: 'Model to use'
    },
    temperature: {
      type: 'number',
      required: false,
      description: 'Temperature (has no effect on reasoner)'
    }
  },

  request: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params) => {
      const messages: Message[] = []

      if (params.systemPrompt) {
        messages.push({
          role: 'system',
          content: params.systemPrompt
        })
      }

      // Always ensure the last message is a user message
      if (params.context) {
        messages.push({
          role: 'user',
          content: params.context
        })
      } else if (params.systemPrompt) {
        // If we have a system prompt but no context, add an empty user message
        messages.push({
          role: 'user',
          content: 'Please respond.'
        })
      }

      return {
        model: 'deepseek-reasoner',
        messages
      }
    }
  },

  async transformResponse(response: Response): Promise<ChatResponse> {
    if (!response.ok) {
      const error = await response.json()
      throw new Error(`DeepSeek API error: ${error.message || response.statusText}`)
    }

    const data = await response.json()
    return {
      output: data.choices[0].message.content,
      tokens: data.usage?.total_tokens,
      model: data.model,
      reasoning_content: data.choices[0].message.reasoning_content
    }
  },

  transformError(error: any): string {
    const message = error.error?.message || error.message
    const code = error.error?.type || error.code
    return `${message} (${code})`
  }
} 