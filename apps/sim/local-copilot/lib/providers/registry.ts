import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { createAnthropicProvider } from '@/local-copilot/lib/providers/anthropic'
import { createBedrockProvider } from '@/local-copilot/lib/providers/bedrock'
import { createGeminiProvider } from '@/local-copilot/lib/providers/gemini'
import { createOpenAiCompatibleProvider } from '@/local-copilot/lib/providers/openai-compatible'
import type { LocalCopilotProvider } from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

let cachedProvider: LocalCopilotProvider | null = null
let cachedProviderKey = ''

/**
 * Builds a Local Copilot provider for the given config (no process-wide cache).
 */
export function createLocalCopilotProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'gemini':
      return createGeminiProvider(config)
    case 'bedrock':
      return createBedrockProvider(config)
    default:
      return createOpenAiCompatibleProvider(config)
  }
}

/**
 * Returns the env-configured Local Copilot provider, caching by config key.
 */
export function getLocalCopilotProvider(): LocalCopilotProvider {
  const config = getLocalCopilotConfig()
  const cacheKey = `${config.provider}:${config.baseUrl ?? ''}:${config.model}:${config.apiKey ?? ''}:${config.region ?? ''}`

  if (cachedProvider && cachedProviderKey === cacheKey) {
    return cachedProvider
  }

  cachedProvider = createLocalCopilotProvider(config)
  cachedProviderKey = cacheKey

  return cachedProvider
}

export function resetLocalCopilotProviderCache(): void {
  cachedProvider = null
  cachedProviderKey = ''
}
