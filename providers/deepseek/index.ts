import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest } from '../types'

export const deepseekProvider: ProviderConfig = {
  id: 'deepseek',
  name: 'Deepseek',
  description: "Deepseek's chat models",
  version: '1.0.0',
  models: ['deepseek-chat'],
  defaultModel: 'deepseek-chat',
  
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  headers: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }),

  transformToolsToFunctions: (tools: ProviderToolConfig[]) => {
    if (!tools || tools.length === 0) {
      return undefined
    }

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters
      }
    }))
  },

  transformFunctionCallResponse: (response: any, tools?: ProviderToolConfig[]): FunctionCallResponse => {
    const toolCall = response.choices?.[0]?.message?.tool_calls?.[0]
    if (!toolCall || !toolCall.function) {
      throw new Error('No valid tool call found in response')
    }

    const tool = tools?.find(t => t.id === toolCall.function.name)
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.function.name}`)
    }

    let args = toolCall.function.arguments
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch (e) {
        console.error('Failed to parse tool arguments:', e)
        args = {}
      }
    }

    return {
      name: toolCall.function.name,
      arguments: {
        ...tool.params,
        ...args
      }
    }
  },

  transformRequest: (request: ProviderRequest, functions?: any) => {
    // Transform messages from internal format to Deepseek format
    const messages = (request.messages || []).map(msg => {
      if (msg.role === 'function') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.name
        }
      }

      if (msg.function_call) {
        return {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: msg.function_call.name,
            type: 'function',
            function: {
              name: msg.function_call.name,
              arguments: msg.function_call.arguments
            }
          }]
        }
      }

      return msg
    })

    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: request.systemPrompt },
        ...(request.context ? [{ role: 'user', content: request.context }] : []),
        ...messages
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 1024,
      ...(functions && { tools: functions })
    }

    return payload
  },

  transformResponse: (response: any) => {
    if (!response) {
      console.warn('Received undefined response from Deepseek API')
      return { content: '' }
    }

    const output = response.choices?.[0]?.message

    return {
      content: output?.content || '',
      tokens: response.usage && {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens
      }
    }
  },

  hasFunctionCall: (response: any) => {
    if (!response) return false
    return !!response.choices?.[0]?.message?.tool_calls?.[0]
  }
}