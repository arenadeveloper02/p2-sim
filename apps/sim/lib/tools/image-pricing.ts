import { getCostMultiplier } from '@/lib/core/config/env-flags'

/**
 * Hosted image generation is billed per output image using provider list prices.
 * OpenAI GPT Image 1.5 per-image rates: https://developers.openai.com/api/docs/models/gpt-image-1.5
 * GPT Image 2 uses published calculator tiers (1K/2K/4K × quality): https://developers.openai.com/api/docs/models/gpt-image-2
 * Gemini image output rates: https://cloud.google.com/vertex-ai/generative-ai/pricing
 */

export type ImageBillingProvider = 'openai' | 'gemini'

export type OpenAIImageQuality = 'low' | 'medium' | 'high' | 'auto'
export type OpenAIImageSizeBucket = '1k' | '2k' | '4k'
export type GeminiImageResolution = '512' | '1K' | '2K' | '4K'

export interface ImageBillingDimensions {
  provider: ImageBillingProvider
  model: string
  size?: string
  quality?: string
  resolution?: string
  aspectRatio?: string
  numImages?: number
  hasEdit?: boolean
}

export interface ImageBillingMetadata extends ImageBillingDimensions {
  providerCostPerImage: number
  imageCount: number
  costMultiplier: number
}

/** Per-image provider cost in USD before platform multiplier. */
export const IMAGE_MODEL_PRICING = {
  openai: {
    'gpt-image-1.5': {
      '1k': { low: 0.009, medium: 0.034, high: 0.133, auto: 0.034, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'gpt-image-1': {
      '1k': { low: 0.011, medium: 0.042, high: 0.167, auto: 0.042, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'gpt-image-1-mini': {
      '1k': { low: 0.005, medium: 0.015, high: 0.052, auto: 0.015, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'chatgpt-image-latest': {
      '1k': { low: 0.009, medium: 0.034, high: 0.133, auto: 0.034, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'gpt-image-2': {
      '1k': { low: 0.006, medium: 0.053, high: 0.13, auto: 0.053, updatedAt: '2026-04-29' },
      '2k': { low: 0.024, medium: 0.12, high: 0.26, auto: 0.12, updatedAt: '2026-04-29' },
      '4k': { low: 0.096, medium: 0.24, high: 0.48, auto: 0.24, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
  },
  gemini: {
    'gemini-2.5-flash-image': {
      default: { perImage: 0.039, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'gemini-3-pro-image-preview': {
      '1K': { perImage: 0.134, updatedAt: '2026-04-29' },
      '2K': { perImage: 0.134, updatedAt: '2026-04-29' },
      '4K': { perImage: 0.24, updatedAt: '2026-04-29' },
      default: { perImage: 0.134, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
    'gemini-3.1-flash-image-preview': {
      '512': { perImage: 0.045, updatedAt: '2026-04-29' },
      '1K': { perImage: 0.067, updatedAt: '2026-04-29' },
      '2K': { perImage: 0.101, updatedAt: '2026-04-29' },
      '4K': { perImage: 0.15, updatedAt: '2026-04-29' },
      default: { perImage: 0.067, updatedAt: '2026-04-29' },
      updatedAt: '2026-04-29',
    },
  },
} as const

function normalizeOpenAIQuality(quality?: string): OpenAIImageQuality {
  const normalized = (quality ?? 'auto').trim().toLowerCase()
  if (normalized === 'standard') return 'medium'
  if (normalized === 'hd') return 'high'
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized
  }
  return 'auto'
}

function normalizeOpenAISizeBucket(model: string, size?: string): OpenAIImageSizeBucket {
  const normalized = (size ?? 'auto').trim().toLowerCase()
  if (model === 'gpt-image-2') {
    if (normalized === '3840x2160') return '4k'
    if (normalized === '2560x1440') return '2k'
    return '1k'
  }
  return '1k'
}

function normalizeGeminiResolution(resolution?: string): GeminiImageResolution {
  const normalized = (resolution ?? '1K').trim().toUpperCase()
  if (normalized === '512') return '512'
  if (normalized === '2K') return '2K'
  if (normalized === '4K') return '4K'
  return '1K'
}

/**
 * Returns the provider list price for a single generated image, or null when unsupported.
 */
export function getImageModelPerImageCost(dimensions: ImageBillingDimensions): number | null {
  const model = dimensions.model.trim()
  const imageCount = Math.max(1, dimensions.numImages ?? 1)

  if (dimensions.provider === 'openai') {
    const modelPricing = IMAGE_MODEL_PRICING.openai[model as keyof typeof IMAGE_MODEL_PRICING.openai]
    if (!modelPricing) return null

    const sizeBucket = normalizeOpenAISizeBucket(model, dimensions.size)
    const quality = normalizeOpenAIQuality(dimensions.quality)
    const sizePricing = modelPricing[sizeBucket as keyof typeof modelPricing]
    if (!sizePricing || typeof sizePricing !== 'object' || !('low' in sizePricing)) {
      return null
    }

    const perImage = sizePricing[quality] ?? sizePricing.auto
    return perImage * imageCount
  }

  if (dimensions.provider === 'gemini') {
    const modelPricing = IMAGE_MODEL_PRICING.gemini[model as keyof typeof IMAGE_MODEL_PRICING.gemini]
    if (!modelPricing) return null

    if ('default' in modelPricing && !('1K' in modelPricing)) {
      return modelPricing.default.perImage * imageCount
    }

    const resolution = normalizeGeminiResolution(dimensions.resolution)
    const resolutionPricing =
      modelPricing[resolution as keyof typeof modelPricing] ??
      ('default' in modelPricing ? modelPricing.default : null)
    if (!resolutionPricing || typeof resolutionPricing !== 'object' || !('perImage' in resolutionPricing)) {
      return null
    }

    return resolutionPricing.perImage * imageCount
  }

  return null
}

/**
 * Hosted billing cost for OpenAI/Gemini image generation (includes platform multiplier).
 */
export function getHostedImageCost(dimensions: ImageBillingDimensions): number {
  const providerCost = getImageModelPerImageCost(dimensions)
  if (providerCost == null || providerCost <= 0) {
    throw new Error(`Unsupported hosted image billing for model "${dimensions.model}"`)
  }

  return providerCost * getCostMultiplier()
}

export function buildImageBillingMetadata(
  dimensions: ImageBillingDimensions
): ImageBillingMetadata {
  const providerCostPerImage =
    getImageModelPerImageCost({ ...dimensions, numImages: 1 }) ??
    (() => {
      throw new Error(`Unsupported hosted image billing for model "${dimensions.model}"`)
    })()
  const imageCount = Math.max(1, dimensions.numImages ?? 1)
  const costMultiplier = getCostMultiplier()

  return {
    ...dimensions,
    providerCostPerImage,
    imageCount,
    costMultiplier,
  }
}

export function extractImageBillingFromOutput(
  output: Record<string, unknown>
): ImageBillingDimensions | null {
  const billing = output.__imageBilling
  if (billing && typeof billing === 'object' && billing !== null) {
    const record = billing as Record<string, unknown>
    const provider = record.provider
    const model = record.model
    if (
      (provider === 'openai' || provider === 'gemini') &&
      typeof model === 'string' &&
      model.trim().length > 0
    ) {
      return {
        provider,
        model: model.trim(),
        size: typeof record.size === 'string' ? record.size : undefined,
        quality: typeof record.quality === 'string' ? record.quality : undefined,
        resolution: typeof record.resolution === 'string' ? record.resolution : undefined,
        aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
        numImages: typeof record.numImages === 'number' ? record.numImages : undefined,
        hasEdit: typeof record.hasEdit === 'boolean' ? record.hasEdit : undefined,
      }
    }
  }

  const metadata = output.metadata
  if (!metadata || typeof metadata !== 'object' || metadata === null) {
    return null
  }

  const meta = metadata as Record<string, unknown>
  const provider = meta.provider
  const model = meta.model
  if (
    (provider === 'openai' || provider === 'gemini') &&
    typeof model === 'string' &&
    model.trim().length > 0
  ) {
    return {
      provider,
      model: model.trim(),
      size: typeof meta.size === 'string' ? meta.size : undefined,
      quality: typeof meta.quality === 'string' ? meta.quality : undefined,
      resolution:
        typeof meta.imageSize === 'string'
          ? meta.imageSize
          : typeof meta.resolution === 'string'
            ? meta.resolution
            : undefined,
      aspectRatio: typeof meta.aspectRatio === 'string' ? meta.aspectRatio : undefined,
      numImages: typeof meta.count === 'number' ? meta.count : 1,
      hasEdit:
        meta.hasInputImage === true ||
        meta.hasInputImages === true ||
        (typeof meta.inputImageCount === 'number' && meta.inputImageCount > 0),
    }
  }

  return null
}

export function calculateHostedImageToolCost(
  params: Record<string, unknown>,
  output: Record<string, unknown>
): { cost: number; metadata: ImageBillingMetadata } {
  const billing =
    extractImageBillingFromOutput(output) ??
    (() => {
      const provider = params.provider
      const model = params.model
      if (
        (provider === 'openai' || provider === 'gemini') &&
        typeof model === 'string' &&
        model.trim().length > 0
      ) {
        return {
          provider,
          model: model.trim(),
          size: typeof params.size === 'string' ? params.size : undefined,
          quality: typeof params.quality === 'string' ? params.quality : undefined,
          resolution:
            typeof params.resolution === 'string'
              ? params.resolution
              : typeof params.imageSize === 'string'
                ? params.imageSize
                : undefined,
          aspectRatio: typeof params.aspectRatio === 'string' ? params.aspectRatio : undefined,
          numImages: typeof params.numImages === 'number' ? params.numImages : 1,
          hasEdit: Boolean(params.inputImage || params.inputImages),
        } satisfies ImageBillingDimensions
      }
      return null
    })()

  if (!billing) {
    throw new Error('Image generation response missing billing dimensions')
  }

  const metadata = buildImageBillingMetadata(billing)
  const cost = metadata.providerCostPerImage * metadata.imageCount * metadata.costMultiplier
  return { cost, metadata }
}
