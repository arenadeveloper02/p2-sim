import { env } from '@/lib/core/config/env'

/**
 * Uses the block-provided key when present; otherwise picks the deployment key for the
 * provider implied by the vision model id (OpenAI, Anthropic, or Gemini).
 */
export function resolveVisionApiKey(
  model: string | undefined,
  providedKey?: string | null
): string | undefined {
  const fromUser = providedKey?.trim()
  if (fromUser) return fromUser

  const m = model?.trim() || 'gpt-5.2'
  if (m.startsWith('claude-')) {
    return env.ANTHROPIC_API_KEY?.trim() || undefined
  }
  if (m.startsWith('gemini-')) {
    return env.GEMINI_API_KEY?.trim() || undefined
  }
  return env.OPENAI_API_KEY?.trim() || undefined
}
