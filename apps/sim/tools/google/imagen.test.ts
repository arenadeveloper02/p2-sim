/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetRotatingApiKey, mockSaveGeneratedImage } = vi.hoisted(() => ({
  mockGetRotatingApiKey: vi.fn(),
  mockSaveGeneratedImage: vi.fn(),
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: mockGetRotatingApiKey,
}))

vi.mock('@/lib/uploads/utils/image-storage.server', () => ({
  saveGeneratedImage: mockSaveGeneratedImage,
}))

import { imagenTool } from '@/tools/google/imagen'

describe('Imagen tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRotatingApiKey.mockReturnValue('google-api-key')
    mockSaveGeneratedImage.mockResolvedValue({
      url: 'https://storage.example.com/generated.png',
      s3UploadFailed: false,
    })
  })

  it('extracts nested Imagen 4 generatedImages and populates image fields', async () => {
    const response = new Response(
      JSON.stringify({
        predictions: [
          {
            generatedImages: [
              {
                imageBytes: 'base64-image',
              },
            ],
          },
        ],
      }),
      { status: 200 }
    )

    const result = await imagenTool.transformResponse?.(response, {
      model: 'imagen-4.0-generate-001',
      prompt: 'Generate a product hero image',
      imageSize: '1K',
      aspectRatio: '1:1',
      _context: {
        workflowId: 'workflow-1',
        userId: 'user-1',
      },
    })

    expect(mockSaveGeneratedImage).toHaveBeenCalledWith(
      'base64-image',
      'workflow-1',
      'user-1',
      'image/png'
    )
    expect(result).toMatchObject({
      success: true,
      output: {
        image: 'https://storage.example.com/generated.png',
        images: ['https://storage.example.com/generated.png'],
        metadata: {
          model: 'imagen-4.0-generate-001',
          numberOfImages: 1,
          stored: true,
        },
      },
    })
  })
})
