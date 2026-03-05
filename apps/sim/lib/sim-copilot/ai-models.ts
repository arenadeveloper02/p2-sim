/**
 * AI Models Configuration for Sim Copilot
 * Defines available providers and models
 */

export type ProviderId = 'openai' | 'anthropic' | 'xai'

export const PROVIDER_ID_TO_LABEL: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  xai: 'xAI',
}

export const PROVIDER_LABEL_TO_ID: Record<string, ProviderId> = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  'xAI': 'xai',
}

export const PROVIDER_ENV_KEY: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
}

export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
  ],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
  ],
  xai: [
    'grok-2-latest',
    'grok-2-vision-latest',
  ],
}

export function getDefaultProvider(): ProviderId {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.XAI_API_KEY) return 'xai'
  return 'openai'
}

export function getDefaultModel(provider: ProviderId): string {
  return PROVIDER_MODELS[provider]?.[0] ?? 'gpt-4o'
}

export function providerLabelToId(label: string | undefined): ProviderId {
  if (!label) return 'openai'
  return PROVIDER_LABEL_TO_ID[label] ?? 'openai'
}

export function getModelsForProvider(provider: ProviderId): string[] {
  return PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.openai
}
