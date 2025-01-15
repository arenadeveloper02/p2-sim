import { AgentConfig } from "./agent";

export interface ModelResponse {
    response: string;
    tokens: number;
    model: string;
  }
  
  export interface ModelRequestOptions {
    maxTokens?: number;
    timeout?: number;
  }
  
  export interface ModelProvider {
    callModel(config: AgentConfig, options: ModelRequestOptions): Promise<ModelResponse>;
    validateConfig(config: AgentConfig): Promise<void>;
  }

export const DEFAULT_MODEL_CONFIGS = {
  'gpt-4': { provider: 'openai' },
  'gpt-3.5-turbo': { provider: 'openai' },
  'claude-3-sonnet': { provider: 'anthropic' },
  'claude-3-opus': { provider: 'anthropic' },
  'gemini-pro': { provider: 'google' },
  'grok-2-latest': { provider: 'xai' }
} as const;