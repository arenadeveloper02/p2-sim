/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  NANO_BANANA_PRO_MODEL,
  resolveNanoBananaReferences,
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
})
