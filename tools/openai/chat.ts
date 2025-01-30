import { ToolConfig, ToolResponse } from '../types' 

interface ChatParams {
  apiKey: string 
  systemPrompt: string 
  context?: string 
  model?: string 
  temperature?: number 
  maxTokens?: number 
  maxCompletionTokens?: number 
  topP?: number 
  frequencyPenalty?: number 
  presencePenalty?: number 
  stream?: boolean 
}

interface ChatResponse extends ToolResponse {
  output: {
    content: string
    model: string
    tokens?: number
    reasoning_tokens?: number
  }
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'openai.chat',
  name: 'OpenAI Chat',
  description: 'Chat with OpenAI models',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'OpenAI API key'
    },
    systemPrompt: {
      type: 'string',
      required: true,
      description: 'System prompt to send to the model'
    },
    context: {
      type: 'string',
      description: 'User message/context to send to the model'
    },
    model: {
      type: 'string',
      default: 'gpt-4o',
      description: 'Model to use (gpt-4o, o1, o1-mini)'
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response (not supported by o1 models)'
    },
    maxCompletionTokens: {
      type: 'number',
      description: 'Maximum number of tokens to generate (including reasoning tokens) for o1 models'
    }
  },

  request: {
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params) => {
      const isO1Model = params.model?.startsWith('o1') 
      const messages = [] 
      
      // For o1-mini, we need to use 'user' role instead of 'system'
      if (params.model === 'o1-mini') {
        messages.push({ role: 'user', content: params.systemPrompt }) 
      } else {
        messages.push({ role: 'system', content: params.systemPrompt }) 
      }
      
      if (params.context) {
        messages.push({ role: 'user', content: params.context }) 
      }

      const body: any = {
        model: params.model || 'gpt-4o',
        messages
      } 

      // Only add parameters supported by the model type
      if (!isO1Model) {
        body.temperature = params.temperature 
        body.max_tokens = params.maxTokens 
        body.top_p = params.topP 
        body.frequency_penalty = params.frequencyPenalty 
        body.presence_penalty = params.presencePenalty 
      } else if (params.maxCompletionTokens) {
        body.max_completion_tokens = params.maxCompletionTokens 
      }

      body.stream = params.stream 
      return body 
    }
  },

  transformResponse: async (response: Response) => {
    const data = await response.json() 
    if (data.choices?.[0]?.delta?.content) {
      return {
        success: true,
        output: {
          content: data.choices[0].delta.content,
          model: data.model
        }
      } 
    }
    return {
      success: true,
      output: {
        content: data.choices[0].message.content,
        model: data.model,
        tokens: data.usage?.total_tokens,
        reasoning_tokens: data.usage?.completion_tokens_details?.reasoning_tokens
      }
    } 
  },

  transformError: (error) => {
    const message = error.error?.message || error.message 
    const code = error.error?.type || error.code 
    return `${message} (${code})` 
  }
}  