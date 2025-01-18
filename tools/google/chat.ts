import { ToolConfig } from '../types';

interface ChatParams {
  apiKey: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

interface ChatResponse {
  output: string;
  tokens?: number;
  model: string;
}

export const chatTool: ToolConfig<ChatParams, ChatResponse> = {
  id: 'google.chat',
  name: 'Google Chat',
  description: 'Chat with Google Gemini models',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'Google API key'
    },
    systemPrompt: {
      type: 'string',
      required: true,
      description: 'System prompt to send to the model'
    },
    model: {
      type: 'string',
      default: 'gemini-pro',
      description: 'Model to use'
    },
    temperature: {
      type: 'number',
      default: 0.7,
      description: 'Controls randomness in the response'
    }
  },

  request: {
    url: 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': params.apiKey
    }),
    body: (params) => {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: params.systemPrompt }]
          }
        ],
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxTokens,
          topP: params.topP,
          topK: params.topK
        }
      };
      return body;
    }
  },

  transformResponse: (data) => {
    return {
      output: data.candidates[0].content.parts[0].text,
      model: 'gemini-pro'
    };
  },

  transformError: (error) => {
    const message = error.error?.message || error.message;
    const code = error.error?.status || error.code;
    return `${message} (${code})`;
  }
}; 