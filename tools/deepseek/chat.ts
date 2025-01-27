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
  responseFormat?: string
}

interface ChatResponse extends ToolResponse {
  tokens?: number
  model: string
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'deepseek.chat',
  name: 'DeepSeek Chat',
  description: 'Chat with DeepSeek-v3 model',
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
      default: 'deepseek-chat',
      description: 'Model to use'
    },
    temperature: {
      type: 'number',
      required: false,
      default: 0.7,
      description: 'Sampling temperature'
    },
    responseFormat: {
      type: 'string',
      required: false,
      description: 'Response format specification'
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

      if (params.context) {
        messages.push({
          role: 'user',
          content: params.context
        })
      }

      const body: any = {
        model: 'deepseek-chat',
        messages,
        temperature: params.temperature
      }

      if (params.responseFormat === 'json') {
        body.response_format = { type: 'json_object' }
      }

      return body
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
      model: data.model
    }
  },

  transformError(error: any): string {
    const message = error.error?.message || error.message
    const code = error.error?.type || error.code
    return `${message} (${code})`
  }
}
