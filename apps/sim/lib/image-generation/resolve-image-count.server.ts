import type { Candidate } from '@google/genai'
import { createLogger } from '@sim/logger'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import { extractTextContent } from '@/providers/google/utils'

const logger = createLogger('ImageGenerationCount')

const SLM_MODEL = 'gemini-2.5-flash-lite'

const PROMPT_IMAGE_URL_REGEX = /https?:\/\/[^\s"'<>`]+/i

function clampCount(n: number): number {
  return Math.min(MAX_IMAGES_TO_GENERATE, Math.max(1, Math.round(n)))
}

/**
 * Normalize an image URL extracted from prompt text or SLM output.
 */
function normalizePromptImageUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim().replace(/[),.;!?]+$/, '')
  if (!trimmed) {
    return undefined
  }

  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : undefined
}

/**
 * Extract the first image URL present in the prompt text.
 */
function extractPromptImageUrl(prompt: string): string | undefined {
  const match = prompt.match(PROMPT_IMAGE_URL_REGEX)
  return normalizePromptImageUrl(match?.[0])
}

interface ParsedSlmFields {
  imageCount: number
  imageUrl?: string
  singleImagePrompt?: string
}

/**
 * Parses SLM output for a suggested image count, image URL, and per-image prompt.
 */
function parseSuggestedFieldsFromSlmText(text: string): ParsedSlmFields {
  const trimmed = text.trim()
  const jsonBlock = trimmed.match(/\{[\s\S]*?"imageCount"[\s\S]*?\}/)
  if (jsonBlock) {
    try {
      const j = JSON.parse(jsonBlock[0]) as {
        imageCount?: unknown
        imageUrl?: unknown
        singleImagePrompt?: unknown
      }
      const n = Number(j.imageCount)
      return {
        imageCount: Number.isFinite(n) ? clampCount(n) : 1,
        imageUrl: typeof j.imageUrl === 'string' ? normalizePromptImageUrl(j.imageUrl) : undefined,
        singleImagePrompt:
          typeof j.singleImagePrompt === 'string' && j.singleImagePrompt.trim().length > 0
            ? j.singleImagePrompt.trim()
            : undefined,
      }
    } catch {
      // fall through
    }
  }

  const digit = trimmed.match(/\b([1-5])\b/)
  return {
    imageCount: digit ? Number(digit[1]) : 1,
    imageUrl: extractPromptImageUrl(trimmed),
  }
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
  /** Image URL extracted from the prompt, if any. */
  promptImageUrl?: string
  /** Prompt rewritten to describe one output image when multiple outputs are needed. */
  singleImagePrompt: string
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
  const promptImageUrl = extractPromptImageUrl(prompt)
  if (!prompt) {
    return { imageCount: asked, slmSuggested: asked, singleImagePrompt: '' }
  }

  const systemInstruction = `You estimate how many distinct image files the user wants generated and rewrite the prompt for one output image file.
Count output files, not concepts inside one file.
Reply with only a JSON object: {"imageCount":N,"imageUrl":"...","singleImagePrompt":"..."}.
"imageCount" must be an integer from 1 to ${MAX_IMAGES_TO_GENERATE}.
"imageUrl" must be the first explicit http/https image URL present in the prompt, or null if none is present.
"singleImagePrompt" must be the prompt that should be sent for one generated output image file.
If the prompt asks for N variations, versions, options, angles, or alternatives, assume that means N separate output images by default.
Only count 1 when the prompt explicitly says those variations should be combined into one image, one collage, one grid, one sheet, or shown side by side in a single image.
If the prompt asks for a single-image comparison/composition and then asks for that whole image multiple times, count the repeats.
When imageCount is greater than 1, rewrite the prompt so each run requests just one output image. Remove only the count/repetition wording that applies across runs, while preserving the user's intent.
When imageCount is 1, keep the prompt meaning the same and usually return the original prompt.
Examples:
- "Give me three variations of this image" => {"imageCount":3,"singleImagePrompt":"Give me a variation of this image"}
- "Give me three variations side by side in a single image" => {"imageCount":1,"singleImagePrompt":"Give me three variations side by side in a single image"}
- "Give me three variations side by side in a single image three times" => {"imageCount":3,"singleImagePrompt":"Give me three variations side by side in a single image"}
- "Generate 4 separate images of this product" => {"imageCount":4,"singleImagePrompt":"Generate an image of this product"}`

  const userText = `User requested image count (slider): ${asked}\n\nPrompt:\n${prompt.slice(0, 8000)}`

  logger.info('SLM image-count input', {
    model: SLM_MODEL,
    asked,
    promptLength: prompt.length,
    hasPromptImageUrl: Boolean(promptImageUrl),
  })

  let slmSuggested = 1
  let resolvedPromptImageUrl = promptImageUrl
  let singleImagePrompt = prompt
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
      return { imageCount: asked, slmSuggested: asked, promptImageUrl, singleImagePrompt: prompt }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: unknown; finishReason?: string }>
    }
    const candidate = data.candidates?.[0] as Candidate | undefined
    const text = extractTextContent(candidate)

    if (!text) {
      logger.info('SLM image-count output', {
        parsedSlmSuggested: asked,
        hasPromptImageUrl: Boolean(promptImageUrl),
      })
      return { imageCount: asked, slmSuggested: asked, promptImageUrl, singleImagePrompt: prompt }
    }

    const parsed = parseSuggestedFieldsFromSlmText(text)
    slmSuggested = parsed.imageCount
    resolvedPromptImageUrl = parsed.imageUrl ?? promptImageUrl
    singleImagePrompt = parsed.singleImagePrompt ?? prompt
    logger.info('SLM image-count output', {
      parsedSlmSuggested: slmSuggested,
      hasPromptImageUrl: Boolean(resolvedPromptImageUrl),
    })
  } catch (error) {
    logger.warn('SLM image-count threw', {
      message: error instanceof Error ? error.message : String(error),
    })
    return { imageCount: asked, slmSuggested: asked, promptImageUrl, singleImagePrompt: prompt }
  }

  const imageCount = clampCount(Math.max(asked, slmSuggested))
  logger.info('SLM image-count resolved', {
    asked,
    imageCount,
    hasPromptImageUrl: Boolean(resolvedPromptImageUrl),
  })
  return {
    imageCount,
    slmSuggested,
    promptImageUrl: resolvedPromptImageUrl,
    singleImagePrompt,
  }
}
