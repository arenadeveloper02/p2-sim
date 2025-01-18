import { ToolConfig } from '../types';

interface ChatParams {
  apiKey: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

interface ChatResponse {
  output: string;
  tokens?: number;
  model: string;
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'xai.chat',
  name: 'xAI Chat',
  description: 'Chat with xAI models',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'xAI API key'
    },
    systemPrompt: {
      type: 'string',
      required: true,
      description: 'System prompt to send to the model'
    },
    model: {
      type: 'string',
      default: 'grok-2-latest',
      description: 'Model to use'
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response'
    }
  },

  request: {
    url: 'https://api.x.ai/v1/chat/completions',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params) => {
      const body = {
        model: params.model || 'grok-2-latest',
        messages: [
          { role: 'system', content: params.systemPrompt }
        ],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        frequency_penalty: params.frequencyPenalty,
        presence_penalty: params.presencePenalty
      };
      return body;
    }
  },

  transformResponse: (data) => {
    return {
      output: data.choices[0].message.content,
      tokens: data.usage?.total_tokens,
      model: data.model
    };
  },

  transformError: (error) => {
    const message = error.error?.message || error.message;
    const code = error.error?.type || error.code;
    return `${message} (${code})`;
  }
}; 