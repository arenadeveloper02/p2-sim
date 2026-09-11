import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { env } from '@/lib/core/config/env'

/**
 * Process-local counter so consecutive Local Copilot Gemini calls (parent
 * rounds, specialists, parallel subagents) spread across GEMINI_API_KEY_1..3
 * instead of pinning one key for a whole minute.
 */
let geminiKeyRotationCounter = 0

/**
 * Collects configured Gemini keys for Local Copilot.
 *
 * When any of `GEMINI_API_KEY_1` / `_2` / `_3` is set, only those slots are
 * used (up to 3) — the singular `GEMINI_API_KEY` / `GOOGLE_API_KEY` fallbacks
 * are ignored so a leftover fourth key does not enter the pool.
 * Falls back to singular / legacy keys only when no rotation slots are set.
 */
export function listLocalCopilotGeminiApiKeys(): string[] {
  const rotationSlots = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
  const hasRotationSlot = rotationSlots.some((candidate) => {
    const key = candidate?.trim()
    return Boolean(key && key !== 'undefined')
  })

  const candidates = hasRotationSlot
    ? rotationSlots
    : [
        env.GEMINI_API_KEY,
        process.env.GOOGLE_API_KEY?.trim(),
        process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim(),
      ]

  const unique: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = candidate?.trim()
    if (!key || key === 'undefined' || seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }
  return unique
}

/**
 * Picks the next Gemini API key for a Local Copilot LLM request.
 *
 * Round-robins `GEMINI_API_KEY_1` / `_2` / `_3` when any are set. Otherwise
 * falls back to `GEMINI_API_KEY` / `GOOGLE_API_KEY`, then the shared
 * minute-based {@link getRotatingApiKey} pool.
 */
export function resolveLocalCopilotGeminiApiKey(): string | undefined {
  const keys = listLocalCopilotGeminiApiKeys()
  if (keys.length > 0) {
    const index = geminiKeyRotationCounter % keys.length
    geminiKeyRotationCounter += 1
    return keys[index]
  }

  try {
    return getRotatingApiKey('gemini')
  } catch {
    return undefined
  }
}

/** Test-only: reset the round-robin counter. */
export function resetLocalCopilotGeminiKeyRotation(): void {
  geminiKeyRotationCounter = 0
}
