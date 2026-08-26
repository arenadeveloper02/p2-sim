import { env } from '@/lib/core/config/env'
import { LLM_KEY_POOLS } from '@/lib/core/config/env-capabilities'

/**
 * Rotates through available API keys for a provider
 * @param provider - The provider to get a key for (e.g., 'openai')
 * @returns The selected API key
 * @throws Error if no API keys are configured for rotation
 */
export function getRotatingApiKey(provider: string): string {
  // Arena custom: Generative Language uses GEMINI_API_KEY*, never NEXT_PUBLIC_GOOGLE_API_KEY
  const poolProvider = provider === 'google' || provider === 'vertex' ? 'gemini' : provider

  if (!(poolProvider in LLM_KEY_POOLS)) {
    throw new Error(`No rotation implemented for provider: ${provider}`)
  }

  const definition = LLM_KEY_POOLS[poolProvider as keyof typeof LLM_KEY_POOLS]
  const keys = definition.keys.map((key) => env[key]).filter((key): key is string => Boolean(key))
  if (keys.length === 0 && 'fallbackKey' in definition) {
    const fallback = env[definition.fallbackKey]
    if (fallback) keys.push(fallback)
  }

  if (keys.length === 0) {
    if (provider === 'google' || provider === 'gemini' || provider === 'vertex') {
      throw new Error(
        'No API keys configured for rotation. Please configure GEMINI_API_KEY (or GEMINI_API_KEY_1..3).'
      )
    }

    throw new Error(
      `No API keys configured for rotation. For ${provider}, set ${provider.toUpperCase()}_API_KEY and/or ${provider.toUpperCase()}_API_KEY_1 through _3.`
    )
  }

  // Simple round-robin rotation based on current minute
  // This distributes load across keys and is stateless
  const currentMinute = new Date().getMinutes()
  const keyIndex = currentMinute % keys.length

  return keys[keyIndex]
}
