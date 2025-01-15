import { AgentConfig } from '../types/agent';
import { ModelProvider, ModelRequestOptions, ModelResponse } from '../types/model';

export class XAIProvider implements ModelProvider {
  async callModel(
    config: AgentConfig,
    options: ModelRequestOptions
  ): Promise<ModelResponse> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: config.systemPrompt
          }
        ],
        temperature: config.temperature,
        max_tokens: options.maxTokens
      }),
      signal: AbortSignal.timeout(options.timeout || 10000)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'xAI API call failed');
    }

    const result = await response.json();
    return {
      response: result.choices[0].message.content,
      tokens: result.usage?.total_tokens || 0,
      model: config.model
    };
  }

  async validateConfig(config: AgentConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('xAI API key is required');
    }
    if (!config.model.startsWith('grok')) {
      throw new Error('Invalid xAI model specified');
    }
  }
} 