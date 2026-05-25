import type { Candidate } from '@google/genai'
import { createLogger } from '@sim/logger'
import { z } from 'zod'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import { extractTextContent } from '@/providers/google/utils'

const logger = createLogger('ImageGenerationCount')

const SLM_MODEL = 'gemini-3.1-flash-lite'

/** Hard timeout for the SLM call so a hung Gemini request never blocks generation. */
const SLM_TIMEOUT_MS = 8000

/** JSON count/prompt rewrite needs only a small response; large values slow the SLM call. */
const SLM_MAX_OUTPUT_TOKENS = 2048

const PROMPT_IMAGE_URL_REGEX = /https?:\/\/[^\s"'<>`]+/i

const SlmResponseSchema = z.object({
  imageCount: z.number().int().min(1).max(MAX_IMAGES_TO_GENERATE),
  imageUrl: z.string().nullish(),
  singleImagePrompt: z.string().nullish(),
  singleImagePrompts: z.array(z.string()).nullish(),
})

const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
} as const

const REQUESTED_OUTPUT_COUNT_REGEX =
  /\b(?:(?:generate|create|make|give|provide|show|produce|render)\s+(?:me\s+)?)?(?<count>[1-5]|one|two|three|four|five)\s+(?:different\s+)?(?:variations?|versions?|options?|alternatives?|separate\s+images?|images?|pictures?|renders?|outputs?)\b/i

const SINGLE_COMPOSITION_REGEX =
  /\b(?:single|one)\s+image\b|\b(?:collage|grid|sheet|side[\s-]by[\s-]side)\b/i

function clampCount(n: number): number {
  return Math.min(MAX_IMAGES_TO_GENERATE, Math.max(1, Math.round(n)))
}

function parseCountToken(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.toLowerCase()
  const wordCount = NUMBER_WORDS[normalized as keyof typeof NUMBER_WORDS]
  if (wordCount) {
    return wordCount
  }

  const numericCount = Number(normalized)
  return Number.isFinite(numericCount) ? clampCount(numericCount) : undefined
}

function extractExplicitOutputCount(prompt: string): number | undefined {
  if (SINGLE_COMPOSITION_REGEX.test(prompt)) {
    return undefined
  }

  const match = prompt.match(REQUESTED_OUTPUT_COUNT_REGEX)
  return parseCountToken(match?.groups?.count)
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
  singleImagePrompts?: string[]
}

function normalizePromptList(value: string[] | null | undefined): string[] | undefined {
  const prompts = value
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_IMAGES_TO_GENERATE)

  return prompts && prompts.length > 0 ? prompts : undefined
}

function buildSingleImagePrompts(
  basePrompt: string,
  imageCount: number,
  suggestedPrompts?: string[]
): string[] {
  const count = clampCount(imageCount)
  const normalizedSuggested = normalizePromptList(suggestedPrompts) ?? []

  if (count === 1) {
    return [normalizedSuggested[0] ?? basePrompt]
  }

  const prompts = normalizedSuggested.slice(0, count)
  for (let index = prompts.length; index < count; index++) {
    prompts.push(
      `${basePrompt}\nVariation ${index + 1} of ${count}: make this output visually distinct from the other variations while preserving the user's requested subject.`
    )
  }

  return prompts
}

/**
 * Parses SLM output for a suggested image count, image URL, and per-image prompt.
 * Tries strict JSON first (we request `responseMimeType: application/json`),
 * then falls back to extracting an embedded JSON object, and finally to a digit heuristic.
 */
function parseSuggestedFieldsFromSlmText(text: string): ParsedSlmFields {
  const trimmed = text.trim()

  const candidates: string[] = []
  if (trimmed.startsWith('{')) {
    candidates.push(trimmed)
  }
  const embedded = trimmed.match(/\{[\s\S]*?"imageCount"[\s\S]*?\}/)
  if (embedded && embedded[0] !== trimmed) {
    candidates.push(embedded[0])
  }

  for (const candidate of candidates) {
    try {
      const parsed = SlmResponseSchema.safeParse(JSON.parse(candidate))
      if (parsed.success) {
        const { imageCount, imageUrl, singleImagePrompt, singleImagePrompts } = parsed.data
        const trimmedSingle = singleImagePrompt?.trim()
        return {
          imageCount: clampCount(imageCount),
          imageUrl: imageUrl ? normalizePromptImageUrl(imageUrl) : undefined,
          singleImagePrompt: trimmedSingle && trimmedSingle.length > 0 ? trimmedSingle : undefined,
          singleImagePrompts: normalizePromptList(singleImagePrompts),
        }
      }
    } catch {
      // try next candidate
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
}

export interface ResolveImageGenerationCountResult {
  /** Final count suggested by the SLM and capped at the maximum allowed images. */
  imageCount: number
  /** Raw SLM suggestion before clamping. */
  slmSuggested: number
  /** Image URL extracted from the prompt, if any. */
  promptImageUrl?: string
  /** Prompt rewritten to describe one output image when multiple outputs are needed. */
  singleImagePrompt: string
  /** Per-output prompts to send for each generation call, when multiple images are requested. */
  singleImagePrompts?: string[]
}

/**
 * Uses a small Gemini model to estimate how many distinct images the prompt implies,
 * then returns the finalized prompt and capped image count inferred from the user's text.
 */
export async function resolveImageGenerationCount(
  input: ResolveImageGenerationCountInput
): Promise<ResolveImageGenerationCountResult> {
  const prompt = input.prompt.trim()
  const promptImageUrl = extractPromptImageUrl(prompt)
  const explicitOutputCount = extractExplicitOutputCount(prompt)
  if (!prompt) {
    return { imageCount: 1, slmSuggested: 1, singleImagePrompt: '', singleImagePrompts: [''] }
  }

  const systemInstruction = `You estimate how many distinct image files the user wants generated and rewrite the prompt for one output image file.
Count output files, not concepts inside one file.
Reply with only a JSON object: {"imageCount":N,"imageUrl":"...","singleImagePrompt":"...","singleImagePrompts":["..."]}.
"imageCount" must be an integer from 1 to ${MAX_IMAGES_TO_GENERATE}.
"imageUrl" must be the first explicit http/https image URL present in the prompt, or null if none is present.
"singleImagePrompt" must be the prompt that should be sent for one generated output image file.
"singleImagePrompts" must contain exactly imageCount prompts, one for each separate generated image.
When imageCount is greater than 1, make every singleImagePrompts entry meaningfully different and concrete. Vary the requested attributes across entries instead of repeating the same generic wording.
If the prompt explicitly asks for a numbered count of variations, versions, options, alternatives, images, pictures, renders, or outputs, imageCount must be that exact number unless the prompt says to combine them into one image.
If the prompt asks for N variations, versions, options, angles, or alternatives, assume that means N separate output images by default.
Only count 1 when the prompt explicitly says those variations should be combined into one image, one collage, one grid, one sheet, or shown side by side in a single image.
If the prompt asks for a single-image comparison/composition and then asks for that whole image multiple times, count the repeats.
When imageCount is greater than 1, rewrite each prompt so each run requests just one output image. Remove only the count/repetition wording that applies across runs, while preserving the user's intent.
When imageCount is 1, keep the prompt meaning the same and usually return the original prompt in both singleImagePrompt and singleImagePrompts.
Examples:
- "Give me three variations of this image" => {"imageCount":3,"singleImagePrompt":"Give me a variation of this image","singleImagePrompts":["Give me variation 1 of this image with a distinct visual direction","Give me variation 2 of this image with a distinct visual direction","Give me variation 3 of this image with a distinct visual direction"]}
- "Give me three variations side by side in a single image" => {"imageCount":1,"singleImagePrompt":"Give me three variations side by side in a single image"}
- "Give me three variations side by side in a single image three times" => {"imageCount":3,"singleImagePrompt":"Give me three variations side by side in a single image"}
- "Generate 4 separate images of this product" => {"imageCount":4,"singleImagePrompt":"Generate an image of this product","singleImagePrompts":["Generate one image of this product with variation 1","Generate one image of this product with variation 2","Generate one image of this product with variation 3","Generate one image of this product with variation 4"]}`

  const userText = `Prompt:\n${prompt.slice(0, 8000)}`

  logger.info('SLM image-count input', {
    model: SLM_MODEL,
    promptLength: prompt.length,
    hasPromptImageUrl: Boolean(promptImageUrl),
    explicitOutputCount,
  })

  let slmSuggested = 1
  let resolvedPromptImageUrl = promptImageUrl
  let singleImagePrompt = prompt
  let singleImagePrompts: string[] | undefined

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), SLM_TIMEOUT_MS)

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
          generationConfig: {
            temperature: 0,
            maxOutputTokens: SLM_MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      logger.warn('SLM image-count HTTP error', {
        status: response.status,
        message: (errBody as { error?: { message?: string } }).error?.message,
      })
      const fallbackCount = explicitOutputCount ?? 1
      return {
        imageCount: fallbackCount,
        slmSuggested: fallbackCount,
        promptImageUrl,
        singleImagePrompt: prompt,
        singleImagePrompts: buildSingleImagePrompts(prompt, fallbackCount),
      }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: unknown; finishReason?: string }>
    }
    const candidate = data.candidates?.[0] as Candidate | undefined
    const text = extractTextContent(candidate)

    if (!text) {
      logger.info('SLM image-count output', {
        parsedSlmSuggested: 1,
        hasPromptImageUrl: Boolean(promptImageUrl),
      })
      const fallbackCount = explicitOutputCount ?? 1
      return {
        imageCount: fallbackCount,
        slmSuggested: fallbackCount,
        promptImageUrl,
        singleImagePrompt: prompt,
        singleImagePrompts: buildSingleImagePrompts(prompt, fallbackCount),
      }
    }

    const parsed = parseSuggestedFieldsFromSlmText(text)
    slmSuggested = parsed.imageCount
    resolvedPromptImageUrl = parsed.imageUrl ?? promptImageUrl
    singleImagePrompt = parsed.singleImagePrompt ?? prompt
    singleImagePrompts = parsed.singleImagePrompts
    logger.info('SLM image-count output', {
      parsedSlmSuggested: slmSuggested,
      hasPromptImageUrl: Boolean(resolvedPromptImageUrl),
      explicitOutputCount,
      singleImagePromptsCount: singleImagePrompts?.length ?? 0,
    })
  } catch (error) {
    const isAbort =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    logger.warn('SLM image-count threw', {
      timedOut: isAbort,
      message: error instanceof Error ? error.message : String(error),
    })
    const fallbackCount = explicitOutputCount ?? 1
    return {
      imageCount: fallbackCount,
      slmSuggested: fallbackCount,
      promptImageUrl,
      singleImagePrompt: prompt,
      singleImagePrompts: buildSingleImagePrompts(prompt, fallbackCount),
    }
  } finally {
    clearTimeout(timeoutHandle)
  }

  const imageCount = explicitOutputCount ?? clampCount(slmSuggested)
  logger.info('SLM image-count resolved', {
    imageCount,
    slmSuggested,
    explicitOutputCount,
    hasPromptImageUrl: Boolean(resolvedPromptImageUrl),
  })
  return {
    imageCount,
    slmSuggested,
    promptImageUrl: resolvedPromptImageUrl,
    singleImagePrompt,
    singleImagePrompts: buildSingleImagePrompts(singleImagePrompt, imageCount, singleImagePrompts),
  }
}
