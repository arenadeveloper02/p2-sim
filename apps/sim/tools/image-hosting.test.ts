/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { imageGenerateTool } from '@/tools/image/generate'
import { nanoBananaTool } from '@/tools/google/nano-banana'
import { imageTool } from '@/tools/openai/image'

describe('OpenAI/Gemini image hosting', () => {
  it('enables image_generate hosting for OpenAI provider', () => {
    const enabled = imageGenerateTool.hosting?.enabled
    expect(typeof enabled).toBe('function')
    if (typeof enabled !== 'function') return

    expect(enabled({ provider: 'openai', model: 'gpt-image-1.5' })).toBe(true)
    expect(enabled({ provider: 'falai', model: 'nano-banana-2' })).toBe(true)
    expect(enabled({ provider: 'openai', model: 'gpt-image-2', __skipHostedKeyHandling: true })).toBe(
      false
    )
  })

  it('bills OpenAI image generation from billing metadata', () => {
    const pricing = imageTool.hosting?.pricing
    expect(pricing?.type).toBe('custom')
    if (!pricing || pricing.type !== 'custom') return

    const result = pricing.getCost(
      { model: 'gpt-image-1.5', size: '1024x1024', quality: 'medium' },
      {
        __imageBilling: {
          provider: 'openai',
          model: 'gpt-image-1.5',
          size: '1024x1024',
          quality: 'medium',
          providerCostPerImage: 0.034,
          imageCount: 1,
          costMultiplier: 1,
        },
      }
    )

    expect(typeof result).toBe('object')
    if (typeof result === 'number') return
    expect(result.cost).toBeCloseTo(0.034)
  })

  it('bills Gemini nano banana generation from billing metadata', () => {
    const pricing = nanoBananaTool.hosting?.pricing
    expect(pricing?.type).toBe('custom')
    if (!pricing || pricing.type !== 'custom') return

    const result = pricing.getCost(
      { model: 'gemini-3.1-flash-image-preview', imageSize: '1K' },
      {
        __imageBilling: {
          provider: 'gemini',
          model: 'gemini-3.1-flash-image-preview',
          resolution: '1K',
          providerCostPerImage: 0.067,
          imageCount: 1,
          costMultiplier: 1,
        },
      }
    )

    expect(typeof result).toBe('object')
    if (typeof result === 'number') return
    expect(result.cost).toBeCloseTo(0.067)
  })
})
