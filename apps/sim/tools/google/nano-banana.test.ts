/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSaveGeneratedImage } = vi.hoisted(() => ({
  mockSaveGeneratedImage: vi.fn(),
}))

vi.mock('@/lib/uploads/utils/image-storage.server', () => ({
  saveGeneratedImage: mockSaveGeneratedImage,
}))

import { buildNanoBananaToolResponse } from '@/app/api/google/api-service'

describe('Nano Banana tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveGeneratedImage.mockResolvedValue({
      url: 'https://storage.example.com/nano-banana-4k.png',
      s3UploadFailed: false,
    })
  })

  it('saves generated image data before returning output', async () => {
    const result = await buildNanoBananaToolResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'large-4k-base64-image',
                  },
                },
              ],
            },
          },
        ],
      },
      {
        model: 'gemini-3-pro-image-preview',
        imageSize: '4K',
        aspectRatio: '1:1',
        _context: {
          workflowId: 'workflow-1',
          sessionUserId: 'user-1',
        },
      }
    )
    expect(mockSaveGeneratedImage).toHaveBeenCalledWith(
      'large-4k-base64-image',
      'workflow-1',
      'user-1',
      'image/png'
    )
    expect(result).toMatchObject({
      success: true,
      output: {
        image: 'https://storage.example.com/nano-banana-4k.png',
        images: ['https://storage.example.com/nano-banana-4k.png'],
        metadata: {
          model: 'gemini-3-pro-image-preview',
          imageSize: '4K',
          stored: true,
        },
      },
    })
  })
})
