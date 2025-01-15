import { AgentConfig } from '../types/agent';
import { ModelProvider, ModelRequestOptions, ModelResponse } from '../types/model';

export class AnthropicProvider implements ModelProvider {
  private readonly SUPPORTED_MODELS = ['claude-3-sonnet', 'claude-3-opus'];
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';

  async callModel(config: AgentConfig, options: ModelRequestOptions): Promise<ModelResponse> {
    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'user', content: config.systemPrompt + '\n' + (config.prompt || '') }
        ],
        temperature: config.temperature,
        max_tokens: options.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    return {
      response: data.content[0].text,
      tokens: data.usage.input_tokens + data.usage.output_tokens,
      model: config.model
    };
  }

  async validateConfig(config: AgentConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    if (!this.SUPPORTED_MODELS.includes(config.model)) {
      throw new Error(`Model ${config.model} is not supported. Use one of: ${this.SUPPORTED_MODELS.join(', ')}`);
    }
  }
}
