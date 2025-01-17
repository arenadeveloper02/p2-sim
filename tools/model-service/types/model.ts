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
  'gpt-4o': { provider: 'openai' },
  'claude': { provider: 'anthropic' },
  'gemini': { provider: 'google' },
  'grok': { provider: 'xai' },
  'deepseek': { provider: 'deepseek' }
} as const;
