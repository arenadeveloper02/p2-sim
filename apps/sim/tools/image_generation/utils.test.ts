/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { googleImagenV2Tool } from '@/tools/image_generation/google-imagen-v2'
import { googleNanoBananaV2Tool } from '@/tools/image_generation/google-nano-banana-v2'
import { openAIImageV2Tool } from '@/tools/image_generation/openai-image-v2'

const INTERNAL_ROUTE_MAX_BYTES = 9.5 * 1024 * 1024

describe('createImageGenerationWrapperTool', () => {
  it('keeps server-only direct execution out of client-bundled v2 tool configs', () => {
    expect(openAIImageV2Tool.directExecution).toBeUndefined()
    expect(googleImagenV2Tool.directExecution).toBeUndefined()
    expect(googleNanoBananaV2Tool.directExecution).toBeUndefined()
  })

  it('sanitizes wrapper request bodies before they hit the internal 9.5MB guard', () => {
    const largeInlinePayload = 'x'.repeat(10 * 1024 * 1024)
    const body = googleNanoBananaV2Tool.request.body?.({
      model: 'gemini-3-pro-image-preview',
      prompt: 'Generate a 4K variation',
      imageSize: '4K',
      inputImages: [
        {
          id: 'file-1',
          name: 'source.png',
          url: 'https://files.example.com/source.png',
          key: 'execution/workflow/execution/source.png',
          type: 'image/png',
          size: 10_000_000,
          base64: largeInlinePayload,
          dataUrl: `data:image/png;base64,${largeInlinePayload}`,
        },
      ],
      inputImage: [
        {
          id: 'file-legacy',
          name: 'legacy.png',
          url: 'https://files.example.com/legacy.png',
          key: 'execution/workflow/execution/legacy.png',
          type: 'image/png',
          size: 10_000_000,
          base64: largeInlinePayload,
        },
      ],
      inputImageUrl: 'https://files.example.com/unused.png',
    })

    expect(body?.baseToolId).toBe('google_nano_banana')
    expect(body?.params.inputImage).toBeUndefined()
    expect(body?.params.inputImageUrl).toBeUndefined()
    expect(JSON.stringify(body).length).toBeLessThan(INTERNAL_ROUTE_MAX_BYTES)
    expect(JSON.stringify(body)).not.toContain(largeInlinePayload)
  })
})
