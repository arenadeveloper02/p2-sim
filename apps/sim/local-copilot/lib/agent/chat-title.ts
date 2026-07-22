import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import {
  resolveEngagementModel,
  resolveEngagementProvider,
} from '@/local-copilot/lib/agent/engagement-status'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { collectCompletionText } from '@/local-copilot/lib/providers/collect-text'
import type { LocalCopilotProvider } from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotChatTitle')

const TITLE_MAX_TOKENS = 32
const TITLE_TIMEOUT_MS = 8000
const TITLE_TEMPERATURE = 0.3
const TITLE_MAX_LENGTH = 60

const SYSTEM_PROMPT = `You name chat conversations in a workflow-automation product.
Rules:
- Return ONLY the title text — no quotes, no trailing punctuation, no explanation.
- 3 to 6 words, written like a short label (e.g. "Slack weekly digest workflow").
- Capture the user's specific intent; never generic titles like "New chat" or "Question".`

/**
 * Deterministic fallback — the user message collapsed to one line and
 * truncated. Matches the sidebar's previous truncation behavior.
 */
export function fallbackChatTitle(message: string): string | null {
  const normalized = message.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  return truncate(normalized, TITLE_MAX_LENGTH).trim()
}

/**
 * Cleans small-model output into a usable title: strips wrapping quotes,
 * collapses whitespace, drops trailing punctuation, and caps the length.
 */
export function sanitizeGeneratedTitle(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\n')) return null
  const cleaned = trimmed
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,]+$/, '')
    .trim()
  if (!cleaned) return null
  return truncate(cleaned, TITLE_MAX_LENGTH).trim() || null
}

/**
 * Generates a real chat title with one small-model call (the same
 * `COPILOT_ENGAGEMENT_MODEL` plumbing used for live status lines).
 * Never throws — falls back to the truncated user message on timeout,
 * abort, or provider error. Returns null only when the message is blank.
 */
export async function generateLocalChatTitle(
  message: string,
  deps?: {
    config?: LocalCopilotConfig
    provider?: LocalCopilotProvider
    model?: string
  }
): Promise<string | null> {
  const trimmed = message.trim()
  if (!trimmed) return null

  const config = deps?.config ?? getLocalCopilotConfig()
  const model = deps?.model ?? resolveEngagementModel(config.provider)
  const provider = deps?.provider ?? resolveEngagementProvider(model, config)

  const timeout = new AbortController()
  try {
    const completion = collectCompletionText({
      provider,
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Name this conversation. First user message:\n\n${trimmed}` },
      ],
      temperature: TITLE_TEMPERATURE,
      maxTokens: TITLE_MAX_TOKENS,
      signal: timeout.signal,
    })
    const raced = await Promise.race([
      completion.then((text) => ({ ok: true as const, text })),
      sleep(TITLE_TIMEOUT_MS).then(() => ({ ok: false as const })),
    ])

    timeout.abort()

    if (!raced.ok) {
      logger.info('Chat title generation timed out; using truncated message', { model })
      return fallbackChatTitle(trimmed)
    }

    const title = sanitizeGeneratedTitle(raced.text)
    if (!title) {
      logger.info('Chat title parse failed; using truncated message', {
        model,
        preview: raced.text.slice(0, 120),
      })
      return fallbackChatTitle(trimmed)
    }

    logger.info('Chat title generated', { model, title })
    return title
  } catch (error) {
    logger.warn('Chat title generation failed; using truncated message', {
      model,
      error: getErrorMessage(error),
    })
    return fallbackChatTitle(trimmed)
  }
}
