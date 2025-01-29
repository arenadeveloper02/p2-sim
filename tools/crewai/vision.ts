import { ToolConfig, ToolResponse } from '../types'

interface CrewAIVisionParams {
  apiKey: string
  imageUrl?: string
  base64Image?: string
  model?: string
}

interface CrewAIVisionResponse extends ToolResponse {
  tokens?: number
  model?: string
}

export const visionTool: ToolConfig<CrewAIVisionParams, CrewAIVisionResponse> = {
  id: 'crewai.vision',
  name: 'CrewAI Vision',
  description: 'Analyze images using CrewAI\'s Vision model',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'Your CrewAI API key'
    },
    imageUrl: {
      type: 'string',
      required: false,
      description: 'Publicly accessible image URL'
    },
    base64Image: {
      type: 'string',
      required: false,
      description: 'Base64-encoded image data'
    },
    model: {
      type: 'string',
      required: false,
      default: 'vision-latest',
      description: 'Model to use for image analysis'
    }
  },

  request: {
    url: 'https://api.crewai.com/v1/vision/analyze',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params) => {
      return {
        model: params.model,
        imageUrl: params.imageUrl,
        base64: params.base64Image
      }
    }
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    return {
      output: data.result,
      tokens: data.usage?.total_tokens,
      model: data.model
    }
  },

  transformError: (error) => {
    const message = error.error?.message || error.message
    const code = error.error?.type || error.code
    return `${message} (${code})`
  }
} 