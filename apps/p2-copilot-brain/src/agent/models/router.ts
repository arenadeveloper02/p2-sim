import { AnthropicModelClient } from '@/agent/models/anthropic'
import { OpenAIModelClient } from '@/agent/models/openai'
import type { ModelClient } from '@/agent/types'
import type { BrainProvider } from '@/protocol'

/**
 * Picks the right model client for a (provider, model) pair.
 *
 * Phase 1 keeps routing simple: one client per provider, selected by Sim based
 * on available BYOK keys. The seam exists so Phase 3 can route by task type
 * (cheap model for reads, strong model for multi-step edits).
 */
export function createModelClient(
  provider: BrainProvider,
  model: string,
  apiKey: string
): ModelClient {
  switch (provider) {
    case 'openai':
      return new OpenAIModelClient(apiKey, model)
    case 'anthropic':
      return new AnthropicModelClient(apiKey, model)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
