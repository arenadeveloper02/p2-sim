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
  stream?: boolean;
}

interface ChatResponse {
  output: string;
  tokens?: number;
  model: string;
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
    model: {
      type: 'string',
      default: 'gpt-4o',
      description: 'Model to use (gpt-4o, o1-mini)'
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response'
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
      console.log('OpenAI Chat Tool - Request Params:', JSON.stringify(params, null, 2));
      const body = {
        model: params.model || 'gpt-4o',
        messages: [
          { role: 'system', content: params.systemPrompt }
        ],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        frequency_penalty: params.frequencyPenalty,
        presence_penalty: params.presencePenalty,
        stream: params.stream
      };
      console.log('OpenAI Chat Tool - Request Body:', JSON.stringify(body, null, 2));
      return body;
    }
  },

  transformResponse: (data) => {
    if (data.choices?.[0]?.delta?.content) {
      return {
        output: data.choices[0].delta.content,
        model: data.model
      };
    }
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