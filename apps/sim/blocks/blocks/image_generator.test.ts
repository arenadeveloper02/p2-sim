/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ImageGeneratorV2Block } from '@/blocks/blocks/image_generator'

describe('ImageGeneratorV2Block', () => {
  it('preserves multiple uploaded references for Fal.ai Nano Banana 2', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'falai',
      model: 'nano-banana-2',
      prompt: 'Edit these product images',
      inputImage: [
        {
          id: 'file-1',
          name: 'source-a.png',
          url: 'https://example.com/source-a.png',
          key: 'execution/ws/wf/ex/source-a.png',
          type: 'image/png',
          size: 123,
        },
        {
          id: 'file-2',
          name: 'source-b.png',
          url: 'https://example.com/source-b.png',
          key: 'execution/ws/wf/ex/source-b.png',
          type: 'image/png',
          size: 456,
        },
      ],
    })

    expect(params).toMatchObject({
      provider: 'falai',
      model: 'nano-banana-2',
      prompt: 'Edit these product images',
    })
    expect(params?.inputImages).toHaveLength(2)
  })
})
