import { ToolConfig, ToolResponse } from '../types'

export interface ReadUrlParams {
  url: string
  useReaderLMv2?: boolean
  removeImages?: boolean
  gatherLinks?: boolean
  jsonResponse?: boolean
  apiKey?: string
}

export interface ReadUrlResponse extends ToolResponse {
  output: {
    content: string
  }
}

export const readUrlTool: ToolConfig<ReadUrlParams, ReadUrlResponse> = {
  id: 'jina.readurl',
  name: 'Jina Reader',
  description: 'Convert any URL to LLM-friendly text using Jina AI Reader',
  version: '1.0.0',

  params: {
    url: {
      type: 'string',
      required: true,
      description: 'The URL to read and convert to markdown'
    },
    useReaderLMv2: {
      type: 'boolean',
      description: 'Whether to use ReaderLM-v2 for better quality'
    },
    removeImages: {
      type: 'boolean',
      description: 'Whether to remove all images from the response'
    },
    gatherLinks: {
      type: 'boolean',
      description: 'Whether to gather all links at the end'
    },
    jsonResponse: {
      type: 'boolean',
      description: 'Whether to return response in JSON format'
    },
    apiKey: {
      type: 'string',
      description: 'Your Jina AI API key'
    }
  },

  request: {
    url: (params: ReadUrlParams) => {
      const baseUrl = `https://r.jina.ai/https://${params.url.replace(/^https?:\/\//, '')}`
      const queryParams = new URLSearchParams()
      
      if (params.useReaderLMv2) queryParams.append('use_readerlm_v2', 'true')
      if (params.removeImages) queryParams.append('remove_images', 'true')
      if (params.gatherLinks) queryParams.append('gather_links', 'true')
      if (params.jsonResponse) queryParams.append('json_response', 'true')

      return `${baseUrl}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    },
    method: 'GET',
    headers: (params: ReadUrlParams) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    })
  },

  transformResponse: async (response: Response) => {
    const content = await response.text()
    return {
      success: response.ok,
      output: {
        content
      }
    }
  },

  transformError: (error) => {
    return error instanceof Error ? error.message : 'Failed to read URL'
  }
} 
