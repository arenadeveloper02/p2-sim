import { env } from '@/lib/core/config/env'

export type P2Provider = 'openai' | 'anthropic'

export interface P2ModelSelection {
  provider: P2Provider
  model: string
  apiKey: string
}

// Top-tier defaults for "immense results". Overridable via P2_COPILOT_MODEL.
// claude-opus-4-8 is Anthropic's flagship Opus; gpt-5.5 is OpenAI's frontier model (June 2026).
const DEFAULT_MODELS: Record<P2Provider, string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-5.5',
}

/**
 * Picks the provider/model/key for a P2 copilot request from BYOK env keys.
 *
 * Preference order: explicit P2_COPILOT_PROVIDER override, then Anthropic, then
 * OpenAI. Returns null when no usable key is configured so the caller can return
 * a clear setup error instead of failing mid-stream.
 */
export function selectModel(): P2ModelSelection | null {
  const override = env.P2_COPILOT_PROVIDER as P2Provider | undefined
  const anthropicKey = env.ANTHROPIC_API_KEY
  const openaiKey = env.OPENAI_API_KEY

  const pick = (provider: P2Provider, apiKey: string): P2ModelSelection => ({
    provider,
    apiKey,
    model: env.P2_COPILOT_MODEL || DEFAULT_MODELS[provider],
  })

  if (override === 'anthropic' && anthropicKey) return pick('anthropic', anthropicKey)
  if (override === 'openai' && openaiKey) return pick('openai', openaiKey)

  if (anthropicKey) return pick('anthropic', anthropicKey)
  if (openaiKey) return pick('openai', openaiKey)

  return null
}
