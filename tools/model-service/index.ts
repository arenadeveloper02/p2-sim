import { ModelProvider, ModelRequestOptions, ModelResponse } from './types/model';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';
import { XAIProvider } from './providers/xai';
import { AgentConfig } from './types/agent';

export class ModelService {
  private static instance: ModelService;
  private providers: Map<string, ModelProvider>;

  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  private initializeProviders() {
    const openai = new OpenAIProvider();
    const anthropic = new AnthropicProvider();
    const google = new GoogleProvider();
    const xai = new XAIProvider();
    // OpenAI models
    this.providers.set('gpt-4o', openai);

    // Anthropic models
    this.providers.set('claude-3-5-sonnet-20241022', anthropic);

    // Google models
    this.providers.set('gemini-pro', google);

    // XAI models
    this.providers.set('grok-2-latest', xai);
  }

  public async callModel(config: AgentConfig, options: ModelRequestOptions = {}): Promise<ModelResponse> {
    const provider = this.providers.get(config.model);
    if (!provider) {
      throw new Error(`No provider found for model: ${config.model}`);
    }

    await provider.validateConfig(config);
    return provider.callModel(config, options);
  }

  public setApiKey(provider: string, apiKey: string): void {
    // Store API keys securely (in memory for now)
    // TODO: Implement secure storage
  }

  public getApiKey(provider: string): string | null {
    // Retrieve API key
    // TODO: Implement secure retrieval
    return null;
  }
}
