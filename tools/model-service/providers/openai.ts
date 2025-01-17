import { AgentConfig } from '../types/agent';
import { ModelProvider, ModelRequestOptions, ModelResponse } from '../types/model';

export class OpenAIProvider implements ModelProvider {
  private readonly SUPPORTED_MODELS = ['gpt-4o'];
  private readonly API_URL = 'https://api.openai.com/v1/chat/completions';

  async callModel(config: AgentConfig, options: ModelRequestOptions): Promise<ModelResponse> {
    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: config.prompt || '' }
        ],
        temperature: config.temperature,
        max_tokens: options.maxTokens,
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return {
      response: data.choices[0].message.content,
      tokens: data.usage.total_tokens,
      model: config.model
    };
  }

  async validateConfig(config: AgentConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    if (!this.SUPPORTED_MODELS.includes(config.model)) {
      throw new Error(`Model ${config.model} is not supported. Use one of: ${this.SUPPORTED_MODELS.join(', ')}`);
    }
  }
}
