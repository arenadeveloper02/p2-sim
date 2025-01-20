import { ToolConfig, ToolResponse } from '../types';

interface ChatParams {
  apiKey: string;
  systemPrompt: string;
  context?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

interface ChatResponse extends ToolResponse {
  tokens?: number;
  model: string;
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'anthropic.chat',
  name: 'Anthropic Chat',
  description: 'Chat with Anthropic Claude models',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'Anthropic API key'
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
      default: 'claude-3-5-sonnet-20241022',
      description: 'Model to use'
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response'
    }
  },

  request: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01'
    }),
    body: (params) => {
      const messages = [
        { role: 'user', content: params.systemPrompt }
      ];
      
      if (params.context) {
        messages.push({ role: 'user', content: params.context });
      }

      const body = {
        model: params.model || 'claude-3-5-sonnet-20241022',
        messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: params.stream
      };
      return body;
    }
  },

  transformResponse: async (response: Response) => {
    const data = await response.json();
    return {
      output: data.completion,
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