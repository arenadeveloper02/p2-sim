import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest } from '../types'

export const xAIProvider: ProviderConfig = {
  id: 'xai',
  name: 'xAI',
  description: "xAI's Grok models",
  version: '1.0.0',
  models: ['grok-2-latest'],
  defaultModel: 'grok-2-latest',
  
  baseUrl: 'https://api.x.ai/v1/chat/completions',
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
    // xAI returns tool_calls array like OpenAI
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
    // Convert function messages to tool messages
    const messages = (request.messages || []).map(msg => {
      if (msg.role === 'function') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.name  // xAI expects tool_call_id for tool results
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
      model: request.model || 'grok-2-latest',
      messages: [
        { role: 'system', content: request.systemPrompt },
        ...(request.context ? [{ role: 'user', content: request.context }] : []),
        ...messages
      ],
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 1024,
      ...(functions && { 
        tools: functions,
        tool_choice: 'auto'  // xAI specific parameter
      })
    }

    return payload
  },

  transformResponse: (response: any) => {
    if (!response) {
      console.warn('Received undefined response from xAI API')
      return { content: '' }
    }

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
    if (!response) return false
    return !!response.choices?.[0]?.message?.tool_calls?.[0]
  }
}