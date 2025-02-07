import { ToolConfig } from '@/tools/types'

export interface TokenInfo {
  prompt?: number
  completion?: number
  total?: number
}

export interface TransformedResponse {
  content: string
  tokens?: TokenInfo
}

export interface ProviderConfig {
  id: string
  name: string
  description: string
  version: string
  models: string[]
  defaultModel: string

  // Provider-specific configuration
  baseUrl: string
  headers: (apiKey: string) => Record<string, string>

  // Tool calling support
  transformToolsToFunctions: (tools: ProviderToolConfig[]) => any
  transformFunctionCallResponse: (
    response: any,
    tools?: ProviderToolConfig[]
  ) => FunctionCallResponse

  // Provider-specific request/response transformations
  transformRequest: (request: ProviderRequest, functions?: any) => any
  transformResponse: (response: any) => TransformedResponse

  // Function to check if response contains a function call
  hasFunctionCall: (response: any) => boolean

  // Internal state for tool name mapping
  _toolNameMapping?: Map<string, string>
}

export interface FunctionCallResponse {
  name: string
  arguments: Record<string, any>
}

export interface ProviderResponse {
  content: string
  model: string
  tokens?: {
    prompt?: number
    completion?: number
    total?: number
  }
  toolCalls?: FunctionCallResponse[]
  toolResults?: any[]
}

export interface ProviderToolConfig {
  id: string
  name: string
  description: string
  params: Record<string, any>
  parameters: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool'
  content: string | null
  name?: string
  function_call?: {
    name: string
    arguments: string
  }
}

export interface ProviderRequest {
  model: string
  systemPrompt: string
  context?: string
  tools?: ProviderToolConfig[]
  temperature?: number
  maxTokens?: number
  apiKey: string
  messages?: Message[]
  responseFormat?: {
    fields: Array<{
      name: string
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      description?: string
    }>
  }
}

// Map of provider IDs to their configurations
export const providers: Record<string, ProviderConfig> = {}
