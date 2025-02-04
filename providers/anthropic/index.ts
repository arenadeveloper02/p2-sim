import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest, Message } from '../types'
import { ToolConfig } from '@/tools/types'

export const anthropicProvider: ProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  description: 'Anthropic\'s Claude models',
  version: '1.0.0',
  models: ['claude-3-5-sonnet-20241022'],
  defaultModel: 'claude-3-5-sonnet-20241022',
  
  baseUrl: 'https://api.anthropic.com/v1/messages',
  headers: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }),

  createRequest: (request: ProviderRequest, functions?: any) => ({
    model: request.model || anthropicProvider.defaultModel,
    messages: [
      ...(request.context ? [{ role: 'user', content: request.context }] : [])
    ],
    system: request.systemPrompt,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    ...(functions && {
      tools: functions
    })
  }),

  extractResponse: (response: any) => {
    const data = response.output || response
    const textContent = data.content?.find((item: any) => item.type === 'text')
    
    return {
      content: textContent?.text || '',
      tokens: {
        prompt: data.usage?.input_tokens,
        completion: data.usage?.output_tokens,
        total: data.usage?.input_tokens + data.usage?.output_tokens
      }
    }
  },

  handleToolCall: (response: any) => {
    const data = response.output || response
    const hasToolUse = data.content?.some((item: any) => item.type === 'tool_use')
    
    if (!hasToolUse) {
      const textContent = data.content?.find((item: any) => item.type === 'text')
      return {
        hasFunctionCall: false,
        content: textContent?.text || ''
      }
    }

    return {
      hasFunctionCall: true
    }
  },

  createToolCallMessage: (functionCall: FunctionCallResponse, result: any): Message => ({
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        name: functionCall.name,
        input: functionCall.arguments
      }
    ]
  }),

  transformToolsToFunctions: (tools: ProviderToolConfig[]) => {
    return tools.map(tool => ({
      type: 'function',
      name: tool.id,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.entries(tool.params).reduce((acc, [key, config]) => {
          acc[key] = {
            type: config.type,
            description: config.description,
            ...(config.default && { default: config.default })
          }
          return acc
        }, {} as Record<string, any>),
        required: Object.entries(tool.params)
          .filter(([_, config]) => config.required)
          .map(([key]) => key)
      }
    }))
  },

  transformFunctionCallResponse: (response: any): FunctionCallResponse => {
    const content = response.output ? response.output.content : response.content
    
    if (!content || !Array.isArray(content)) {
      throw new Error('Invalid response format: content is missing or not an array')
    }

    const toolUse = content.find(item => item.type === 'tool_use')
    if (!toolUse) {
      throw new Error('No tool use found in response')
    }

    return {
      name: toolUse.name,
      arguments: typeof toolUse.input === 'string'
        ? JSON.parse(toolUse.input)
        : toolUse.input
    }
  }
} 