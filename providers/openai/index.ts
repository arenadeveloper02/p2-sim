import { ProviderConfig, FunctionCallResponse, ProviderToolConfig } from '../types'
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
      description: tool.description || '',
      parameters: {
        ...tool.parameters,
        properties: Object.entries(tool.parameters.properties).reduce((acc, [key, value]) => ({
          ...acc,
          [key]: {
            ...value,
            ...(key in tool.params && { default: tool.params[key] })
          }
        }), {})
      }
    }))
  },

  transformFunctionCallResponse: (response: any, tools?: ProviderToolConfig[]): FunctionCallResponse => {
    const functionCall = response.choices?.[0]?.message?.function_call
    if (!functionCall) {
      throw new Error('No function call found in response')
    }

    const args = typeof functionCall.arguments === 'string' 
      ? JSON.parse(functionCall.arguments)
      : functionCall.arguments

    const tool = tools?.find(t => t.id === functionCall.name)
    const toolParams = tool?.params || {}

    return {
      name: functionCall.name,
      arguments: {
        ...toolParams,  // First spread the stored params to ensure they're used as defaults
        ...args         // Then spread any overrides from the function call
      }
    }
  }
} 
