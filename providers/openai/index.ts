import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest } from '../types'
import { ToolConfig } from '@/tools/types'

export const openaiProvider: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  description: "OpenAI's GPT models",
  version: '1.0.0',
  models: ['gpt-4o', 'o1', 'o3-mini'],
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
    console.log('OpenAI transformRequest - Input:', JSON.stringify(request, null, 2))
    
    const isO1Model = request.model?.startsWith('o1')
    const isO1Mini = request.model === 'o1-mini'

    // Helper function to transform message role
    const transformMessageRole = (message: any) => {
      if (isO1Mini && message.role === 'system') {
        return { ...message, role: 'user' }
      }
      return message
    }

    // Start with an empty array for all messages
    const allMessages = []

    // Add system prompt if present
    if (request.systemPrompt) {
      allMessages.push(transformMessageRole({
        role: 'system',
        content: request.systemPrompt
      }))
    }

    // Add context if present
    if (request.context) {
      allMessages.push({
        role: 'user',
        content: request.context
      })
    }

    // Add remaining messages, transforming roles as needed
    if (request.messages) {
      allMessages.push(...request.messages.map(transformMessageRole))
    }

    // Build the request payload
    const payload: any = {
      model: request.model || 'gpt-4o',
      messages: allMessages
    }

    // Only add parameters supported by the model type
    if (!isO1Model) {
      // gpt-4o supports standard parameters
      if (request.temperature !== undefined) payload.temperature = request.temperature
      if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens
    } else {
      // o1 models use max_completion_tokens
      if (request.maxTokens !== undefined) {
        payload.max_completion_tokens = request.maxTokens
      }
    }

    // Add function calling support (supported by all models)
    if (functions) {
      payload.functions = functions
      payload.function_call = 'auto'
    }

    console.log('OpenAI transformRequest - Output:', JSON.stringify(payload, null, 2))
    return payload
  },

  transformResponse: (response: any) => {
    const output = {
      content: response.choices?.[0]?.message?.content || '',
      tokens: undefined as any
    }

    if (response.usage) {
      output.tokens = {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens
      }

      // Add reasoning_tokens for o1 models if available
      if (response.usage.completion_tokens_details?.reasoning_tokens) {
        output.tokens.reasoning = response.usage.completion_tokens_details.reasoning_tokens
      }
    }

    return output
  },

  hasFunctionCall: (response: any) => {
    return !!response.choices?.[0]?.message?.function_call
  }
}