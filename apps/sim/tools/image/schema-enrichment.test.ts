/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  enrichImageAspectRatioSchema,
  enrichImageModelSchema,
  enrichImageResolutionSchema,
} from '@/tools/image/schema-enrichment'

describe('image schema enrichment', () => {
  it('lists OpenAI model IDs when provider is openai', async () => {
    const schema = await enrichImageModelSchema('openai')
    expect(schema?.enum).toEqual(
      expect.arrayContaining(['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'])
    )
    expect(schema?.description).toContain('gpt-image-1.5')
  })

  it('lists aspect ratios for Nano Banana 2', async () => {
    const schema = await enrichImageAspectRatioSchema('gemini-3.1-flash-image-preview')
    expect(schema?.enum).toEqual(expect.arrayContaining(['1:1', '16:9', '1:4']))
  })

  it('lists resolutions for Nano Banana 2', async () => {
    const schema = await enrichImageResolutionSchema('gemini-3.1-flash-image-preview')
    expect(schema?.enum).toEqual(['512', '1K', '2K', '4K'])
  })

  it('explains that OpenAI models use size instead of aspect ratio', async () => {
    const schema = await enrichImageAspectRatioSchema('gpt-image-1.5')
    expect(schema?.enum).toBeUndefined()
    expect(schema?.description).toContain('size')
  })
})
