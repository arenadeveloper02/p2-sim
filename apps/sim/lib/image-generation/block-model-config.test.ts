/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  assertGeminiImageModel,
  getDefaultImageModelForProvider,
  getImageBlockModelOptionsForProvider,
  getMaxReferenceImages,
  normalizeImageModelId,
  reconcileImageProviderAndModel,
  resolveImageProviderForModel,
  supportsMultipleReferenceImages,
} from '@/lib/image-generation/block-model-config'

describe('resolveImageProviderForModel', () => {
  it('maps catalog OpenAI models to openai', () => {
    expect(resolveImageProviderForModel('gpt-image-2')).toBe('openai')
    expect(resolveImageProviderForModel('gpt-image-1.5')).toBe('openai')
  })

  it('maps catalog Gemini models to gemini', () => {
    expect(resolveImageProviderForModel('gemini-3.1-flash-image-preview')).toBe('gemini')
    expect(resolveImageProviderForModel('gemini-2.5-flash-image')).toBe('gemini')
  })

  it('maps catalog Ideogram models to ideogram', () => {
    expect(resolveImageProviderForModel('generate_v4')).toBe('ideogram')
    expect(resolveImageProviderForModel('remix_v4')).toBe('ideogram')
  })

  it('maps legacy Ideogram models to ideogram', () => {
    expect(resolveImageProviderForModel('edit')).toBe('ideogram')
    expect(resolveImageProviderForModel('generate_transparent_v3')).toBe('ideogram')
  })

  it('maps Fal.ai model aliases to falai', () => {
    expect(resolveImageProviderForModel('nano-banana-2')).toBe('falai')
    expect(resolveImageProviderForModel('flux-2-pro')).toBe('falai')
  })

  it('maps OpenAI aliases to openai', () => {
    expect(resolveImageProviderForModel('chatgpt-image-latest')).toBe('openai')
    expect(resolveImageProviderForModel('dall-e-3')).toBe('openai')
  })

  it('normalizes common model typos', () => {
    expect(normalizeImageModelId('gpt-images-2')).toBe('gpt-image-2')
    expect(normalizeImageModelId(' GPT-IMAGE-1-5 ')).toBe('gpt-image-1.5')
  })

  it('allows multiple reference images for gpt-image-2 and alias gpt-images-2', () => {
    expect(getMaxReferenceImages('gpt-image-2')).toBe(16)
    expect(getMaxReferenceImages('gpt-images-2')).toBe(16)
    expect(supportsMultipleReferenceImages('gpt-image-2')).toBe(true)
    expect(supportsMultipleReferenceImages('gpt-image-1.5')).toBe(false)
  })
})

describe('getImageBlockModelOptionsForProvider', () => {
  it('returns all models when provider is empty', () => {
    const options = getImageBlockModelOptionsForProvider('')
    expect(options.map((option) => option.id)).toEqual(
      expect.arrayContaining(['gpt-image-2', 'generate_v4', 'gemini-3.1-flash-image-preview'])
    )
  })

  it('returns only Ideogram models when provider is ideogram', () => {
    expect(getImageBlockModelOptionsForProvider('ideogram').map((option) => option.id)).toEqual([
      'generate_v4',
      'remix_v4',
      'inpaint_v3',
    ])
  })

  it('does not list removed Ideogram models in the picker', () => {
    const ids = getImageBlockModelOptionsForProvider('ideogram').map((option) => option.id)
    expect(ids).not.toContain('edit')
    expect(ids).not.toContain('generate_transparent_v3')
  })

  it('returns only OpenAI models when provider is openai', () => {
    const ids = getImageBlockModelOptionsForProvider('openai').map((option) => option.id)
    expect(ids).toContain('gpt-image-2')
    expect(ids).not.toContain('generate_v4')
    expect(ids).not.toContain('gemini-3.1-flash-image-preview')
  })
})

describe('reconcileImageProviderAndModel', () => {
  it('coerces provider from gpt-image-2 when provider is missing', () => {
    expect(reconcileImageProviderAndModel({ model: 'gpt-image-2' })).toEqual({
      provider: 'openai',
      model: 'gpt-image-2',
      coerced: false,
    })
  })

  it('coerces provider from generate_v4 when provider is missing', () => {
    expect(reconcileImageProviderAndModel({ model: 'generate_v4' })).toEqual({
      provider: 'ideogram',
      model: 'generate_v4',
      coerced: false,
    })
  })

  it('coerces provider from gpt-image-2 when provider is gemini', () => {
    expect(reconcileImageProviderAndModel({ provider: 'gemini', model: 'gpt-image-2' })).toEqual({
      provider: 'openai',
      model: 'gpt-image-2',
      coerced: true,
    })
  })

  it('keeps gemini provider for gemini models', () => {
    expect(
      reconcileImageProviderAndModel({
        provider: 'gemini',
        model: 'gemini-3-pro-image-preview',
      })
    ).toEqual({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      coerced: false,
    })
  })

  it('defaults to openai and gpt-image-1.5 when both are omitted', () => {
    expect(reconcileImageProviderAndModel({})).toEqual({
      provider: 'openai',
      model: 'gpt-image-1.5',
      coerced: false,
    })
  })

  it('uses provider default model when only provider is set', () => {
    expect(reconcileImageProviderAndModel({ provider: 'gemini' })).toEqual({
      provider: 'gemini',
      model: getDefaultImageModelForProvider('gemini'),
      coerced: false,
    })
    expect(reconcileImageProviderAndModel({ provider: 'ideogram' })).toEqual({
      provider: 'ideogram',
      model: 'generate_v4',
      coerced: false,
    })
  })
})

describe('assertGeminiImageModel', () => {
  it('accepts supported Gemini models', () => {
    expect(() => assertGeminiImageModel('gemini-3.1-flash-image-preview')).not.toThrow()
  })

  it('rejects OpenAI models with a provider hint', () => {
    expect(() => assertGeminiImageModel('gpt-image-2')).toThrow(
      'Model "gpt-image-2" requires provider "openai"'
    )
  })

  it('rejects unknown models', () => {
    expect(() => assertGeminiImageModel('not-a-model')).toThrow('Invalid Gemini model')
  })
})
