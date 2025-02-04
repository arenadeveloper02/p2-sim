import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest } from '../types'
import { ToolConfig } from '@/tools/types'

export const openaiProvider: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI\'s GPT models',
  version: '1.0.0',
  models: ['gpt-4o', 'o1', 'o1-mini'],
  defaultModel: 'gpt-4o',
  
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  headers: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }),

  transformToolsToFunctions: (tools: ProviderToolConfig[]) => {
    if (!tools || tools.length === 0) {
      return undefined
    }

    return tools.map(tool => ({
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters
    }))
  },

  transformFunctionCallResponse: (response: any, tools?: ProviderToolConfig[]): FunctionCallResponse => {
    const functionCall = response.choices?.[0]?.message?.function_call
    if (!functionCall) {
      throw new Error('No function call found in response')
    }

    const tool = tools?.find(t => t.id === functionCall.name)
    const toolParams = tool?.params || {}

    return {
      name: functionCall.name,
      arguments: {
        ...toolParams,
        ...JSON.parse(functionCall.arguments)
      }
    }
  },

  transformRequest: (request: ProviderRequest, functions?: any) => {
    return {
      model: request.model || 'gpt-4o',
      messages: [
        { role: 'system', content: request.systemPrompt },
        ...(request.context ? [{ role: 'user', content: request.context }] : []),
        ...(request.messages || [])
      ],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(functions && { 
        functions,
        function_call: 'auto'
      })
    }
  },

  transformResponse: (response: any) => {
    return {
      content: response.choices?.[0]?.message?.content || '',
      tokens: response.usage && {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens
      }
    }
  },

  hasFunctionCall: (response: any) => {
    return !!response.choices?.[0]?.message?.function_call
  }
} 
