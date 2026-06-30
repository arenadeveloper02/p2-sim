import type { Candidate } from '@google/genai'
import { createLogger } from '@sim/logger'
import { z } from 'zod'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import { resolveImageGenerationCount } from '@/lib/image-generation/resolve-image-count.server'
import { extractTextContent } from '@/providers/google/utils'

const logger = createLogger('ImageCreatorIntent')

const SLM_MODEL = 'gemini-3.1-flash-lite'
const SLM_TIMEOUT_MS = 10000
const SLM_MAX_OUTPUT_TOKENS = 1024

const EDIT_INTENT_REGEX =
  /\b(?:edit|modify|change|add|remove|update|adjust|replace|fix|enhance|alter|put|insert)\b/i

const CONTEXT_REFERENCE_REGEX =
  /\b(?:above|previous|earlier|last\s+image|that\s+image|this\s+image|the\s+same|of\s+it)\b/i

const REQUESTED_OUTPUT_COUNT_REGEX =
  /\b(?:(?:generate|create|make|give|provide|show|produce|render)\s+(?:me\s+)?)?(?<count>[1-5]|one|two|three|four|five)\s+(?:(?:different|separate)\s+)*(?:variations?|versions?|options?|alternatives?|separate\s+images?|images?|pictures?|renders?|outputs?)\b/i

const SlmPromptRewriteSchema = z.object({
  mode: z.enum(['generate', 'edit', 'variation']),
  prompts: z.array(z.string().min(1)).min(1).max(MAX_IMAGES_TO_GENERATE),
})

export type ImageCreatorMode = z.infer<typeof SlmPromptRewriteSchema>['mode']

export interface ResolveImageCreatorIntentInput {
  prompt: string
  hasReferenceImage?: boolean
}

export interface ResolveImageCreatorIntentResult {
  imageCount: number
  slmSuggested: number
  mode: ImageCreatorMode
  promptImageUrl?: string
  singleImagePrompt: string
  singleImagePrompts: string[]
}

function clampCount(n: number): number {
  return Math.min(MAX_IMAGES_TO_GENERATE, Math.max(1, Math.round(n)))
}

function stripVariationCountPhrases(prompt: string): string {
  return prompt
    .replace(REQUESTED_OUTPUT_COUNT_REGEX, '')
    .replace(/\b(?:some|several|multiple|a few)\s+variations?\b/gi, 'variations')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function inferMode(prompt: string, hasReferenceImage: boolean, imageCount: number): ImageCreatorMode {
  if (imageCount > 1) {
    return 'variation'
  }

  if (hasReferenceImage && (EDIT_INTENT_REGEX.test(prompt) || CONTEXT_REFERENCE_REGEX.test(prompt))) {
    return 'edit'
  }

  return 'generate'
}

function buildFallbackVariationPrompts(
  prompt: string,
  count: number,
  mode: ImageCreatorMode,
  hasReferenceImage: boolean
): string[] {
  const cleaned = stripVariationCountPhrases(prompt) || prompt
  const referencePrefix =
    hasReferenceImage && (mode === 'edit' || mode === 'variation' || CONTEXT_REFERENCE_REGEX.test(prompt))
      ? 'Using the provided reference image, '
      : ''

  if (count <= 1) {
    if (mode === 'edit' && hasReferenceImage) {
      return [`${referencePrefix}Edit the reference image: ${cleaned}. Output exactly one edited image.`]
    }
    return [cleaned]
  }

  return Array.from({ length: count }, (_, index) => {
    const variationHint =
      mode === 'variation'
        ? `Create exactly one distinct variation (image ${index + 1} of ${count}).`
        : `Create exactly one distinct image (output ${index + 1} of ${count}).`
    return `${referencePrefix}${cleaned}. ${variationHint} Do not combine multiple images, panels, grids, or side-by-side compositions into a single output image.`
  })
}

function parseSlmPromptRewrite(text: string): z.infer<typeof SlmPromptRewriteSchema> | undefined {
  const trimmed = text.trim()
  const candidates: string[] = []
  if (trimmed.startsWith('{')) {
    candidates.push(trimmed)
  }
  const embedded = trimmed.match(/\{[\s\S]*?"prompts"[\s\S]*?\}/)
  if (embedded && embedded[0] !== trimmed) {
    candidates.push(embedded[0])
  }

  for (const candidate of candidates) {
    try {
      const parsed = SlmPromptRewriteSchema.safeParse(JSON.parse(candidate))
      if (parsed.success) {
        return parsed.data
      }
    } catch {
      // try next candidate
    }
  }

  return undefined
}

async function rewritePromptsWithSlm(input: {
  prompt: string
  imageCount: number
  hasReferenceImage: boolean
  mode: ImageCreatorMode
}): Promise<string[] | undefined> {
  const systemInstruction = `You rewrite image-generation prompts so each output is exactly one separate image file.
Reply with only JSON: {"mode":"generate|edit|variation","prompts":["..."]}.
"prompts" length must equal the requested image count (${input.imageCount}).
Each prompt must request ONE standalone image only — never a collage, grid, sheet, or side-by-side composition.
For variations: each prompt must describe a distinct creative interpretation while preserving the user's subject.
For edits: each prompt must clearly instruct editing the provided reference image when a reference is available.
Remove phrases like "3 variations" or "create 4 images" from individual prompts — the count is handled separately.
Preserve the user's creative intent and subject matter.`

  const userText = `Requested image count: ${input.imageCount}
Reference image provided: ${input.hasReferenceImage ? 'yes' : 'no'}
Detected mode: ${input.mode}
User prompt:
${input.prompt.slice(0, 8000)}`

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
      logger.warn('Image creator prompt rewrite HTTP error', { status: response.status })
      return undefined
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: unknown }>
    }
    const candidate = data.candidates?.[0] as Candidate | undefined
    const text = extractTextContent(candidate)
    if (!text) {
      return undefined
    }

    const parsed = parseSlmPromptRewrite(text)
    if (!parsed || parsed.prompts.length !== input.imageCount) {
      return undefined
    }

    return parsed.prompts.map((prompt) => prompt.trim()).filter((prompt) => prompt.length > 0)
  } catch (error) {
    logger.warn('Image creator prompt rewrite failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return undefined
  } finally {
    clearTimeout(timeoutHandle)
  }
}

/**
 * Resolves how many images to generate and rewrites prompts so each provider call
 * requests exactly one output image (variations, edits, and multi-image asks).
 */
export async function resolveImageCreatorIntent(
  input: ResolveImageCreatorIntentInput
): Promise<ResolveImageCreatorIntentResult> {
  const prompt = input.prompt.trim()
  const hasReferenceImage = input.hasReferenceImage === true

  if (!prompt) {
    return {
      imageCount: 1,
      slmSuggested: 1,
      mode: 'generate',
      singleImagePrompt: '',
      singleImagePrompts: [''],
    }
  }

  const baseResolution = await resolveImageGenerationCount({ prompt })
  const imageCount = clampCount(baseResolution.imageCount)
  const mode = inferMode(prompt, hasReferenceImage, imageCount)

  const shouldRewrite = imageCount > 1 || mode === 'edit' || /\bvariations?\b/i.test(prompt)

  let singleImagePrompts = baseResolution.singleImagePrompts ?? [prompt]

  if (shouldRewrite) {
    const rewritten = await rewritePromptsWithSlm({
      prompt,
      imageCount,
      hasReferenceImage,
      mode,
    })

    singleImagePrompts =
      rewritten && rewritten.length === imageCount
        ? rewritten
        : buildFallbackVariationPrompts(prompt, imageCount, mode, hasReferenceImage)
  } else if (singleImagePrompts.length !== imageCount) {
    singleImagePrompts = buildFallbackVariationPrompts(prompt, imageCount, mode, hasReferenceImage)
  }

  logger.info('Image creator intent resolved', {
    imageCount,
    mode,
    hasReferenceImage,
    slmSuggested: baseResolution.slmSuggested,
    rewrittenPromptCount: singleImagePrompts.length,
  })

  return {
    imageCount,
    slmSuggested: baseResolution.slmSuggested,
    mode,
    promptImageUrl: baseResolution.promptImageUrl,
    singleImagePrompt: singleImagePrompts[0] ?? prompt,
    singleImagePrompts,
  }
}
