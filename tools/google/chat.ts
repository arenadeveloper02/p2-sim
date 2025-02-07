import { ToolConfig, ToolResponse } from '../types'

export interface ChatParams {
  apiKey: string
  systemPrompt: string
  context?: string
  model?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
}

export interface ChatResponse extends ToolResponse {
  output: {
    content: string
    model: string
    tokens?: number
    safetyRatings?: any[]
  }
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'google_chat',
  name: 'Google Chat',
  description:
    "Interact with Google's Gemini models for advanced language tasks with built-in safety ratings. Supports system prompts, context management, and fine-tuned generation parameters including top-k and top-p sampling.",
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'Google API key',
    },
    systemPrompt: {
      type: 'string',
      required: true,
      description: 'System prompt to send to the model',
    },
    context: {
      type: 'string',
      description: 'User message/context to send to the model',
    },
    model: {
      type: 'string',
      default: 'gemini-2.0-flash-001',
      description: 'Model to use',
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response',
    },
  },

  request: {
    url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-001:generateContent',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': params.apiKey,
    }),
    body: (params) => {
      const contents = [
        {
          role: 'model',
          parts: [{ text: params.systemPrompt }],
        },
      ]

      if (params.context) {
        contents.push({
          role: 'user',
          parts: [{ text: params.context }],
        })
      }

      const body = {
        contents,
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxTokens,
          topP: params.topP,
          topK: params.topK,
        },
      }
      return body
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    return {
      success: true,
      output: {
        content: data.candidates[0].content.parts[0].text,
        model: data.model,
        tokens: data.usage?.totalTokens,
        safetyRatings: data.candidates[0].safetyRatings,
      },
    }
  },

  transformError: (error) => {
    const message = error.error?.message || error.message
    const code = error.error?.status || error.code
    return `${message} (${code})`
  },
}
