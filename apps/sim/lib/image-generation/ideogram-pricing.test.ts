/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateIdeogramHostedCost,
  getIdeogramPostProcessRawCost,
  getIdeogramRawCostPerImage,
  IDEOGRAM_POST_PROCESS_RAW_COST_USD,
  normalizeIdeogramRenderingSpeed,
} from '@/lib/image-generation/ideogram-pricing'
import { ideogramGenerateV4Tool } from '@/tools/ideogram/generate_v4'
import { ideogramRemixV4Tool } from '@/tools/ideogram/remix_v4'
import { ideogramUpscaleTool } from '@/tools/ideogram/upscale'

vi.mock('@/lib/core/config/env-flags', () => ({
  getCostMultiplier: () => 1,
}))

describe('ideogram-pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes rendering speed with DEFAULT fallback', () => {
    expect(normalizeIdeogramRenderingSpeed('QUALITY')).toBe('QUALITY')
    expect(normalizeIdeogramRenderingSpeed('turbo')).toBe('TURBO')
    expect(normalizeIdeogramRenderingSpeed(undefined)).toBe('DEFAULT')
    expect(normalizeIdeogramRenderingSpeed('nope')).toBe('DEFAULT')
  })

  it('prices Ideogram 4.0 generate by rendering speed', () => {
    expect(
      getIdeogramRawCostPerImage({ operation: 'generate_v4', renderingSpeed: 'TURBO' })
    ).toBeCloseTo(0.03)
    expect(
      getIdeogramRawCostPerImage({ operation: 'generate_v4', renderingSpeed: 'DEFAULT' })
    ).toBeCloseTo(0.06)
    expect(
      getIdeogramRawCostPerImage({ operation: 'generate_v4', renderingSpeed: 'QUALITY' })
    ).toBeCloseTo(0.1)
    expect(
      getIdeogramRawCostPerImage({ operation: 'generate_v4', renderingSpeed: 'FLASH' })
    ).toBeCloseTo(0.03)
  })

  it('prices Ideogram 3.0 inpaint and transparent by tier', () => {
    expect(
      getIdeogramRawCostPerImage({ operation: 'inpaint_v3', renderingSpeed: 'QUALITY' })
    ).toBeCloseTo(0.09)
    expect(
      getIdeogramRawCostPerImage({
        operation: 'generate_transparent_v3',
        renderingSpeed: 'DEFAULT',
      })
    ).toBeCloseTo(0.07)
  })

  it('prices flat-fee operations', () => {
    expect(getIdeogramRawCostPerImage({ operation: 'edit' })).toBeCloseTo(0.2)
    expect(getIdeogramRawCostPerImage({ operation: 'upscale' })).toBeCloseTo(0.06)
    expect(getIdeogramRawCostPerImage({ operation: 'describe_v4' })).toBeCloseTo(0.015)
    expect(getIdeogramRawCostPerImage({ operation: 'layerize_text' })).toBeCloseTo(0.09)
    expect(getIdeogramRawCostPerImage({ operation: 'remove_background' })).toBeCloseTo(0.01)
  })

  it('multiplies hosted cost by image count from output', () => {
    const result = calculateIdeogramHostedCost(
      'generate_v4',
      { renderingSpeed: 'TURBO' },
      { imageUrls: ['https://a.png', 'https://b.png'] }
    )
    expect(result.cost).toBeCloseTo(0.06)
    expect(result.metadata.imageCount).toBe(2)
    expect(result.metadata.providerCostPerImage).toBeCloseTo(0.03)
  })

  it('returns 0 for free operations like magic prompt and poll', () => {
    expect(calculateIdeogramHostedCost('magic_prompt_v4', {}, {}).cost).toBe(0)
    expect(calculateIdeogramHostedCost('poll_generation', {}, {}).cost).toBe(0)
  })

  it('exposes post-process COGS aligned with catalog rates', () => {
    expect(IDEOGRAM_POST_PROCESS_RAW_COST_USD.upscale).toBeCloseTo(0.06)
    expect(IDEOGRAM_POST_PROCESS_RAW_COST_USD.describe_v4).toBeCloseTo(0.015)
    expect(getIdeogramPostProcessRawCost('reframe_v3')).toBeCloseTo(0.06)
    expect(
      getIdeogramPostProcessRawCost('reframe_v3', { renderingSpeed: 'QUALITY' })
    ).toBeCloseTo(0.09)
    expect(getIdeogramPostProcessRawCost('upscale', { byok: true })).toBe(0)
  })
})

describe('ideogram tool hosting', () => {
  it('attaches hosted pricing to generate/remix/upscale tools', () => {
    expect(ideogramGenerateV4Tool.hosting?.byokProviderId).toBe('ideogram')
    expect(ideogramRemixV4Tool.hosting?.pricing.type).toBe('custom')
    expect(ideogramUpscaleTool.hosting?.envKeyPrefix).toBe('IDEOGRAM_API_KEY')

    const pricing = ideogramGenerateV4Tool.hosting?.pricing
    expect(pricing?.type).toBe('custom')
    if (!pricing || pricing.type !== 'custom') return

    const result = pricing.getCost(
      { renderingSpeed: 'DEFAULT' },
      { imageUrls: ['https://cdn.example.com/out.png'] }
    )
    expect(typeof result).toBe('object')
    if (typeof result === 'number') return
    expect(result.cost).toBeCloseTo(0.06)
  })
})
