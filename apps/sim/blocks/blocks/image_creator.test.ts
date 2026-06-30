/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ImageCreatorBlock } from '@/blocks/blocks/image_creator'
import { AGENT_TOOL_BLOCK_TYPES } from '@/blocks/utils'

describe('ImageCreatorBlock', () => {
  it('is eligible as an agent tool', () => {
    expect(AGENT_TOOL_BLOCK_TYPES.has('image_creator')).toBe(true)
  })

  it('resolves to image_creator for agent execution', () => {
    expect(ImageCreatorBlock.tools?.access).toEqual(['image_creator'])
    expect(ImageCreatorBlock.tools?.config.tool?.({})).toBe('image_creator')
  })

  it('maps Gemini params and reference images', () => {
    const params = ImageCreatorBlock.tools.config.params?.({
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'Create 3 variations of a red bus',
      aspectRatio: '16:9',
      resolution: '2K',
      inputImage: {
        id: 'file-1',
        name: 'bus.png',
        url: 'https://example.com/bus.png',
        type: 'image/png',
      },
    })

    expect(params).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'Create 3 variations of a red bus',
      aspectRatio: '16:9',
      resolution: '2K',
      inputImage: {
        id: 'file-1',
        name: 'bus.png',
        url: 'https://example.com/bus.png',
        type: 'image/png',
      },
    })
  })
})
