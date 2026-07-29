/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  calculateHostedImageToolCost,
  getImageModelPerImageCost,
  getHostedImageCost,
} from '@/lib/tools/image-pricing'

vi.mock('@/lib/core/config/env-flags', () => ({
  getCostMultiplier: () => 1,
}))

describe('image-pricing', () => {
  it('returns OpenAI GPT Image 1.5 high-quality 1024 pricing', () => {
    expect(
      getImageModelPerImageCost({
        provider: 'openai',
        model: 'gpt-image-1.5',
        size: '1024x1024',
        quality: 'high',
      })
    ).toBeCloseTo(0.133)
  })

  it('returns GPT Image 2 4K medium pricing', () => {
    expect(
      getImageModelPerImageCost({
        provider: 'openai',
        model: 'gpt-image-2',
        size: '3840x2160',
        quality: 'medium',
      })
    ).toBeCloseTo(0.24)
  })

  it('returns Gemini 3.1 Flash Image 4K pricing', () => {
    expect(
      getImageModelPerImageCost({
        provider: 'gemini',
        model: 'gemini-3.1-flash-image-preview',
        resolution: '4K',
      })
    ).toBeCloseTo(0.15)
  })

  it('calculates hosted image tool cost from output billing metadata', () => {
    const result = calculateHostedImageToolCost(
      { provider: 'openai', model: 'gpt-image-1.5' },
      {
        __imageBilling: {
          provider: 'openai',
          model: 'gpt-image-1.5',
          size: '1024x1024',
          quality: 'medium',
          numImages: 1,
        },
      }
    )

    expect(result.cost).toBeCloseTo(0.034)
    expect(result.metadata.model).toBe('gpt-image-1.5')
  })

  it('applies cost multiplier for hosted billing', () => {
    expect(
      getHostedImageCost({
        provider: 'gemini',
        model: 'gemini-2.5-flash-image',
      })
    ).toBeCloseTo(0.039)
  })
})
