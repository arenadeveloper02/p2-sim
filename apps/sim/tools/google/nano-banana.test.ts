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
import { nanoBananaTool } from '@/tools/google/nano-banana'

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

  it('strips inline payload fields from request body file references', () => {
    const body = nanoBananaTool.request.body?.({
      model: 'gemini-3-pro-image-preview',
      prompt: 'Fuse images',
      inputImages: [
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

    expect(body).toMatchObject({
      inputImages: [
        {
          id: 'file-1',
          name: 'source.png',
          url: 'https://files.example.com/source.png',
          key: 'execution/workflow/execution/source.png',
          type: 'image/png',
          size: 10_000_000,
        },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('large-base64-payload')
  })

  it('surfaces finishMessage when Gemini returns empty content without image parts', async () => {
    await expect(
      buildNanoBananaToolResponse(
        {
          candidates: [
            {
              content: {},
              finishReason: 'IMAGE_OTHER',
              finishMessage:
                'Unable to show the generated image. The model could not generate the image based on the prompt provided.',
              index: 0,
            },
          ],
        },
        {
          model: 'gemini-3-pro-image-preview',
          imageSize: '4K',
        }
      )
    ).rejects.toThrow(
      'Google Nano Banana could not generate an image (IMAGE_OTHER): Unable to show the generated image. The model could not generate the image based on the prompt provided. Try Resolution 2K or 1K, fewer reference images, or smaller reference images.'
    )
  })
})
