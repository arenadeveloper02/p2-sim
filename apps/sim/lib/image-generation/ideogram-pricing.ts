import { getCostMultiplier } from '@/lib/core/config/env-flags'
import type { IdeogramPostProcessorOperation } from '@/lib/image-generation/ideogram-post-processor-fields'
import type { IdeogramOperation } from '@/tools/ideogram/constants'

/**
 * Ideogram API list prices (USD) before USAGE_LOG_COST_MULTIPLIER.
 * Source: https://ideogram.ai/features/api-pricing (revised 2025-08-06).
 *
 * Generate / Remix / Edit / Reframe / Replace Background share model+tier rates.
 * Transparent, Instructional Edit, Upscale, Describe, and Layerize have separate fees.
 */

export type IdeogramRenderingSpeed = 'FLASH' | 'TURBO' | 'DEFAULT' | 'QUALITY'

export interface IdeogramBillingDimensions {
  operation: IdeogramOperation
  renderingSpeed?: string
  numImages?: number
}

export interface IdeogramBillingMetadata extends IdeogramBillingDimensions {
  providerCostPerImage: number
  imageCount: number
  costMultiplier: number
  pricingTier: string
}

const V4_PER_IMAGE: Record<IdeogramRenderingSpeed, number> = {
  FLASH: 0.03,
  TURBO: 0.03,
  DEFAULT: 0.06,
  QUALITY: 0.1,
}

const V3_PER_IMAGE: Record<IdeogramRenderingSpeed, number> = {
  FLASH: 0.03,
  TURBO: 0.03,
  DEFAULT: 0.06,
  QUALITY: 0.09,
}

const TRANSPARENT_V3_PER_IMAGE: Record<IdeogramRenderingSpeed, number> = {
  FLASH: 0.04,
  TURBO: 0.04,
  DEFAULT: 0.07,
  QUALITY: 0.1,
}

/** Flat per-call / per-input fees that do not vary by rendering speed. */
const FLAT_OPERATION_COST_USD: Partial<Record<IdeogramOperation, number>> = {
  edit: 0.2,
  upscale: 0.06,
  describe: 0.01,
  describe_v4: 0.015,
  layerize_text: 0.09,
  remove_background: 0.01,
  magic_prompt_v4: 0,
  poll_generation: 0,
}

const V4_SPEED_OPERATIONS = new Set<IdeogramOperation>([
  'generate_v4',
  'generate_v4_async',
  'remix_v4',
])

const V3_SPEED_OPERATIONS = new Set<IdeogramOperation>([
  'generate_v3',
  'inpaint_v3',
  'remix_v3',
  'reframe_v3',
  'replace_background_v3',
])

/**
 * Normalizes Ideogram rendering_speed to a billing tier.
 * Unset / unknown values default to DEFAULT (balanced) pricing.
 */
export function normalizeIdeogramRenderingSpeed(speed?: string): IdeogramRenderingSpeed {
  const normalized = (speed ?? 'DEFAULT').trim().toUpperCase()
  if (
    normalized === 'FLASH' ||
    normalized === 'TURBO' ||
    normalized === 'DEFAULT' ||
    normalized === 'QUALITY'
  ) {
    return normalized
  }
  return 'DEFAULT'
}

/**
 * Returns the raw (pre-multiplier) per-image Ideogram COGS for an operation + tier.
 */
export function getIdeogramRawCostPerImage(dimensions: IdeogramBillingDimensions): number {
  const { operation } = dimensions

  if (operation in FLAT_OPERATION_COST_USD) {
    return FLAT_OPERATION_COST_USD[operation] ?? 0
  }

  const speed = normalizeIdeogramRenderingSpeed(dimensions.renderingSpeed)

  if (operation === 'generate_transparent_v3') {
    return TRANSPARENT_V3_PER_IMAGE[speed]
  }

  if (V4_SPEED_OPERATIONS.has(operation)) {
    return V4_PER_IMAGE[speed]
  }

  if (V3_SPEED_OPERATIONS.has(operation)) {
    return V3_PER_IMAGE[speed]
  }

  throw new Error(`Unsupported Ideogram billing for operation "${operation}"`)
}

/**
 * Counts billable Ideogram images from tool output, falling back to requested count.
 */
export function countIdeogramBillableImages(
  params: Record<string, unknown>,
  output: Record<string, unknown>
): number {
  if (Array.isArray(output.imageUrls)) {
    const urls = output.imageUrls.filter((url): url is string => typeof url === 'string' && url.length > 0)
    if (urls.length > 0) return urls.length
  }

  if (Array.isArray(output.images) && output.images.length > 0) {
    return output.images.length
  }

  if (typeof output.imageUrl === 'string' && output.imageUrl.length > 0) {
    return 1
  }

  if (typeof output.content === 'string' && output.content.startsWith('http')) {
    return 1
  }

  if (typeof output.baseImageUrl === 'string' && output.baseImageUrl.length > 0) {
    return 1
  }

  const requested = params.numImages
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return Math.floor(requested)
  }

  return 1
}

/**
 * Hosted Ideogram post-process COGS (USD) before USAGE_LOG_COST_MULTIPLIER.
 * BYOK calls should pass cost 0 — the customer supplies their own key.
 */
export const IDEOGRAM_POST_PROCESS_RAW_COST_USD: Record<IdeogramPostProcessorOperation, number> = {
  describe_v4: getIdeogramRawCostPerImage({ operation: 'describe_v4' }),
  layerize_text: getIdeogramRawCostPerImage({ operation: 'layerize_text' }),
  reframe_v3: getIdeogramRawCostPerImage({
    operation: 'reframe_v3',
    renderingSpeed: 'DEFAULT',
  }),
  remove_background: getIdeogramRawCostPerImage({ operation: 'remove_background' }),
  upscale: getIdeogramRawCostPerImage({ operation: 'upscale' }),
} as const

/**
 * Returns the raw (pre-multiplier) hosted cost for a post-process operation.
 */
export function getIdeogramPostProcessRawCost(
  operation: IdeogramPostProcessorOperation,
  options?: { byok?: boolean; renderingSpeed?: string }
): number {
  if (options?.byok) return 0
  return getIdeogramRawCostPerImage({
    operation,
    renderingSpeed: options?.renderingSpeed,
  })
}

/**
 * Builds billing metadata for an Ideogram tool call (includes platform multiplier).
 */
export function buildIdeogramBillingMetadata(
  dimensions: IdeogramBillingDimensions
): IdeogramBillingMetadata {
  const providerCostPerImage = getIdeogramRawCostPerImage({ ...dimensions, numImages: 1 })
  const imageCount = Math.max(1, dimensions.numImages ?? 1)
  const costMultiplier = getCostMultiplier()
  const speed = normalizeIdeogramRenderingSpeed(dimensions.renderingSpeed)

  return {
    ...dimensions,
    renderingSpeed: speed,
    providerCostPerImage,
    imageCount,
    costMultiplier,
    pricingTier: `${dimensions.operation}:${speed}`,
  }
}

/**
 * Hosted billing cost for an Ideogram tool (includes platform multiplier).
 * Throws when the operation cannot be priced.
 */
export function calculateIdeogramHostedCost(
  operation: IdeogramOperation,
  params: Record<string, unknown>,
  output: Record<string, unknown>
): { cost: number; metadata: IdeogramBillingMetadata } {
  const flat = FLAT_OPERATION_COST_USD[operation]
  if (flat === 0) {
    const metadata = buildIdeogramBillingMetadata({
      operation,
      renderingSpeed: typeof params.renderingSpeed === 'string' ? params.renderingSpeed : undefined,
      numImages: 1,
    })
    return { cost: 0, metadata }
  }

  const imageCount = countIdeogramBillableImages(params, output)
  const metadata = buildIdeogramBillingMetadata({
    operation,
    renderingSpeed: typeof params.renderingSpeed === 'string' ? params.renderingSpeed : undefined,
    numImages: imageCount,
  })

  if (metadata.providerCostPerImage < 0) {
    throw new Error(`Invalid Ideogram pricing for operation "${operation}"`)
  }

  const cost = metadata.providerCostPerImage * metadata.imageCount * metadata.costMultiplier
  return { cost, metadata }
}
