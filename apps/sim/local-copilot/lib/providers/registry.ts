import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { createAnthropicProvider } from '@/local-copilot/lib/providers/anthropic'
import { createOpenAiCompatibleProvider } from '@/local-copilot/lib/providers/openai-compatible'
import type { LocalCopilotProvider } from '@/local-copilot/lib/providers/types'

let cachedProvider: LocalCopilotProvider | null = null
let cachedProviderKey = ''

export function getLocalCopilotProvider(): LocalCopilotProvider {
  const config = getLocalCopilotConfig()
  const cacheKey = `${config.provider}:${config.baseUrl ?? ''}:${config.model}`

  if (cachedProvider && cachedProviderKey === cacheKey) {
    return cachedProvider
  }

  cachedProvider =
    config.provider === 'anthropic'
      ? createAnthropicProvider(config)
      : createOpenAiCompatibleProvider(config)
  cachedProviderKey = cacheKey

  return cachedProvider
}

export function resetLocalCopilotProviderCache(): void {
  cachedProvider = null
  cachedProviderKey = ''
}
