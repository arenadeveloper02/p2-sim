import type { Candidate } from '@google/genai'
import { createLogger } from '@sim/logger'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import { extractTextContent } from '@/providers/google/utils'

const logger = createLogger('ImageGenerationCount')

const SLM_MODEL = 'gemini-2.5-flash-lite'

const MAX_LOG_CHARS = 2000

function truncateForLog(text: string, max = MAX_LOG_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function clampCount(n: number): number {
  return Math.min(MAX_IMAGES_TO_GENERATE, Math.max(1, Math.round(n)))
}

/**
 * Parses SLM output for a suggested image count (JSON or a lone digit).
 */
function parseSuggestedCountFromSlmText(text: string): number {
  const trimmed = text.trim()
  const jsonBlock = trimmed.match(/\{[\s\S]*?"imageCount"[\s\S]*?\}/)
  if (jsonBlock) {
    try {
      const j = JSON.parse(jsonBlock[0]) as { imageCount?: unknown }
      const n = Number(j.imageCount)
      if (Number.isFinite(n)) return clampCount(n)
    } catch {
      // fall through
    }
  }
  const digit = trimmed.match(/\b([1-5])\b/)
  if (digit) return Number(digit[1])
  return 1
}

export interface ResolveImageGenerationCountInput {
  prompt: string
  askedCount: number
}

export interface ResolveImageGenerationCountResult {
  /** Final count after `max(asked, slmSuggested)` and cap. */
  imageCount: number
  /** Raw SLM suggestion before combining with the user count. */
  slmSuggested: number
}

/**
 * Uses a small Gemini model to estimate how many distinct images the prompt implies,
 * then returns `min(MAX_IMAGES_TO_GENERATE, max(askedCount, slmSuggested))`.
 */
export async function resolveImageGenerationCount(
  input: ResolveImageGenerationCountInput
): Promise<ResolveImageGenerationCountResult> {
  const asked = clampCount(Number(input.askedCount) || 1)
  const prompt = input.prompt.trim()
  if (!prompt) {
    return { imageCount: asked, slmSuggested: asked }
  }

  const systemInstruction = `You estimate how many distinct image outputs are needed for an image-generation prompt.
Reply with only a JSON object: {"imageCount":N} where N is an integer from 1 to ${MAX_IMAGES_TO_GENERATE}.
Consider multiple subjects, scenes, angles, variations, or comparisons. If one image suffices, N is 1.`

  const userText = `User requested image count (slider): ${asked}\n\nPrompt:\n${prompt.slice(0, 8000)}`

  logger.info('SLM image-count input', {
    model: SLM_MODEL,
    asked,
    systemInstruction,
    userText: truncateForLog(userText),
  })

  let slmSuggested = 1
  try {
    const apiKey = getRotatingApiKey('google')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${SLM_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0, maxOutputTokens: 128 },
        }),
      }
    )

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      logger.warn('SLM image-count HTTP error', {
        status: response.status,
        message: (errBody as { error?: { message?: string } }).error?.message,
      })
      return { imageCount: asked, slmSuggested: asked }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: unknown; finishReason?: string }>
    }
    const candidate = data.candidates?.[0] as Candidate | undefined
    const text = extractTextContent(candidate)

    if (!text) {
      logger.info('SLM image-count output', { rawText: '', parsedSlmSuggested: asked })
      return { imageCount: asked, slmSuggested: asked }
    }

    slmSuggested = parseSuggestedCountFromSlmText(text)
    logger.info('SLM image-count output', {
      rawText: truncateForLog(text),
      parsedSlmSuggested: slmSuggested,
    })
  } catch (error) {
    logger.warn('SLM image-count threw', {
      message: error instanceof Error ? error.message : String(error),
    })
    return { imageCount: asked, slmSuggested: asked }
  }

  const imageCount = clampCount(Math.max(asked, slmSuggested))
  logger.info('SLM image-count resolved', { asked, imageCount })
  return { imageCount, slmSuggested }
}
