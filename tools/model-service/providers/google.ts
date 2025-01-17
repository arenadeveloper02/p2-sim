import { AgentConfig } from '../types/agent';
import { ModelProvider, ModelRequestOptions, ModelResponse } from '../types/model';

export class GoogleProvider implements ModelProvider {
  private readonly SUPPORTED_MODELS = ['gemini-pro'];
  private readonly API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  async callModel(config: AgentConfig, options: ModelRequestOptions): Promise<ModelResponse> {
    const response = await fetch(`${this.API_URL}?key=${config.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: config.systemPrompt + '\n' + (config.prompt || '')
          }]
        }],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: options.maxTokens
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Google API error');
    }

    const data = await response.json();
    return {
      response: data.candidates[0].content.parts[0].text,
      tokens: data.usage?.totalTokens || 0,
      model: config.model
    };
  }

  async validateConfig(config: AgentConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Google API key is required');
    }
    if (!this.SUPPORTED_MODELS.includes(config.model)) {
      throw new Error(`Model ${config.model} is not supported. Use one of: ${this.SUPPORTED_MODELS.join(', ')}`);
    }
  }
}
