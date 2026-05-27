/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  NANO_BANANA_PRO_MODEL,
  resolveNanoBananaReferences,
  sanitizeImageGenerationWrapperParams,
  stripInlinePayloadFromFileReference,
} from '@/lib/image-generation/nano-banana-inputs'

describe('resolveNanoBananaReferences', () => {
  it('strips inline payload fields from uploaded file references for Nano Banana Pro', () => {
    const result = resolveNanoBananaReferences({
      model: NANO_BANANA_PRO_MODEL,
      uploadedReferences: [
        {
          id: 'file-1',
          name: 'source.png',
          url: 'https://files.example.com/source.png',
          key: 'execution/workflow/execution/source.png',
          type: 'image/png',
          size: 10_000_000,
          base64: 'large-base64-payload',
          data: 'large-data-payload',
          dataUrl: 'data:image/png;base64,large-data-url-payload',
          bytes: 'large-bytes-payload',
        },
      ],
    })

    expect(result).toEqual({
      inputImage: {
        id: 'file-1',
        name: 'source.png',
        url: 'https://files.example.com/source.png',
        key: 'execution/workflow/execution/source.png',
        type: 'image/png',
        size: 10_000_000,
      },
    })
  })

  it('strips inline payload fields from direct tool request references', () => {
    expect(
      stripInlinePayloadFromFileReference({
        id: 'file-1',
        name: 'source.png',
        url: 'https://files.example.com/source.png',
        key: 'execution/workflow/execution/source.png',
        type: 'image/png',
        size: 10_000_000,
        base64: 'large-base64-payload',
        data: 'large-data-payload',
        dataUrl: 'data:image/png;base64,large-data-url-payload',
        bytes: 'large-bytes-payload',
      })
    ).toEqual({
      id: 'file-1',
      name: 'source.png',
      url: 'https://files.example.com/source.png',
      key: 'execution/workflow/execution/source.png',
      type: 'image/png',
      size: 10_000_000,
    })
  })

  it('strips nested inline payload fields from generated image outputs', () => {
    expect(
      stripInlinePayloadFromFileReference({
        image: 'https://files.example.com/generated.png',
        images: [
          {
            url: 'https://files.example.com/generated.png',
            type: 'image/png',
            base64: 'large-nested-base64-payload',
            dataUrl: 'data:image/png;base64,large-nested-data-url-payload',
          },
        ],
        metadata: {
          base64: 'large-metadata-base64-payload',
        },
      })
    ).toEqual({
      image: 'https://files.example.com/generated.png',
      images: [
        {
          url: 'https://files.example.com/generated.png',
          type: 'image/png',
        },
      ],
      metadata: {},
    })
  })
})

describe('sanitizeImageGenerationWrapperParams', () => {
  const INTERNAL_ROUTE_MAX_BYTES = 9.5 * 1024 * 1024
  const largeInlinePayload = 'x'.repeat(10 * 1024 * 1024)

  it('removes inline payload fields merged from hydrated UserFile references', () => {
    const sanitized = sanitizeImageGenerationWrapperParams({
      model: NANO_BANANA_PRO_MODEL,
      prompt: 'Edit this 4K image',
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
      inputImageUrls: 'https://files.example.com/unused-2.png',
    })

    expect(sanitized.inputImage).toBeUndefined()
    expect(sanitized.inputImageUrl).toBeUndefined()
    expect(sanitized.inputImageUrls).toBeUndefined()
    expect(sanitized.inputImages).toEqual([
      {
        id: 'file-1',
        name: 'source.png',
        url: 'https://files.example.com/source.png',
        key: 'execution/workflow/execution/source.png',
        type: 'image/png',
        size: 10_000_000,
      },
    ])
    expect(JSON.stringify(sanitized).length).toBeLessThan(INTERNAL_ROUTE_MAX_BYTES)
    expect(JSON.stringify(sanitized)).not.toContain(largeInlinePayload)
  })

  it('drops legacy URL fields when a resolved inputImage is present', () => {
    const sanitized = sanitizeImageGenerationWrapperParams({
      model: NANO_BANANA_PRO_MODEL,
      prompt: 'Edit this image',
      inputImage: {
        key: 'agent-generated-images/workflow/user/image.png',
        url: '/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png',
        type: 'image/png',
        size: 8_000_000,
        base64: largeInlinePayload,
      },
      inputImageUrl: 'https://files.example.com/unused.png',
    })

    expect(sanitized.inputImageUrl).toBeUndefined()
    expect(JSON.stringify(sanitized.inputImage)).not.toContain(largeInlinePayload)
  })
})
