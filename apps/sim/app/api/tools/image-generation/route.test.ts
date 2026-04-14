/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockResolveImageGenerationCount, mockExecuteTool } = vi.hoisted(
  () => ({
    mockCheckInternalAuth: vi.fn(),
    mockResolveImageGenerationCount: vi.fn(),
    mockExecuteTool: vi.fn(),
  })
)

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@/lib/image-generation/resolve-image-count.server', () => ({
  resolveImageGenerationCount: mockResolveImageGenerationCount,
}))

vi.mock('@/tools', () => ({
  executeTool: mockExecuteTool,
}))

import { POST } from '@/app/api/tools/image-generation/route'

describe('Image Generation Wrapper API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCheckInternalAuth.mockResolvedValue({
      success: true,
      userId: 'user-123',
    })
    mockResolveImageGenerationCount.mockResolvedValue({
      imageCount: 1,
      promptImageUrl: undefined,
      singleImagePrompt: undefined,
    })
    mockExecuteTool.mockResolvedValue({
      success: true,
      output: {
        image: 'https://example.com/generated.png',
        metadata: {},
      },
    })
  })

  it('should preserve multi-image fusion inputs for Nano Banana requests', async () => {
    const inputImages = [{ path: 's3://bucket/source-a.png' }, { path: 's3://bucket/source-b.png' }]
    const request = createMockRequest('POST', {
      baseToolId: 'google_nano_banana',
      params: {
        model: 'gemini-3-pro-image-preview',
        prompt: 'Fuse these images together',
        imageCount: 1,
        inputImageUrl: 'https://example.com/single-image.png',
        inputImages,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'google_nano_banana',
      expect.objectContaining({
        model: 'gemini-3-pro-image-preview',
        prompt: 'Fuse these images together',
        inputImages,
      })
    )
    expect(mockExecuteTool.mock.calls[0]?.[1]).not.toHaveProperty('inputImage')
    expect(data).toMatchObject({
      success: true,
      output: {
        image: 'https://example.com/generated.png',
        images: ['https://example.com/generated.png'],
      },
    })
  })

  it('should map a single Nano Banana image URL to inputImage when no fusion images exist', async () => {
    const request = createMockRequest('POST', {
      baseToolId: 'google_nano_banana',
      params: {
        model: 'gemini-3-pro-image-preview',
        prompt: 'Edit this image',
        imageCount: 1,
        inputImageUrl: 'https://example.com/single-image.png',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'google_nano_banana',
      expect.objectContaining({
        model: 'gemini-3-pro-image-preview',
        prompt: 'Edit this image',
        inputImage: 'https://example.com/single-image.png',
      })
    )
  })

  it('should use the rewritten single-image prompt for repeated Nano Banana generations', async () => {
    mockResolveImageGenerationCount.mockResolvedValue({
      imageCount: 3,
      promptImageUrl: undefined,
      singleImagePrompt: 'Give me a variation of this image',
    })

    const request = createMockRequest('POST', {
      baseToolId: 'google_nano_banana',
      params: {
        model: 'gemini-3-pro-image-preview',
        prompt: 'Give me three variations of this image',
        imageCount: 1,
        inputImageUrl: 'https://example.com/source.png',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledTimes(3)
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      1,
      'google_nano_banana',
      expect.objectContaining({
        prompt: 'Give me a variation of this image',
        inputImage: 'https://example.com/source.png',
      })
    )
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      2,
      'google_nano_banana',
      expect.objectContaining({
        prompt: 'Give me a variation of this image',
        inputImage: 'https://example.com/source.png',
      })
    )
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      3,
      'google_nano_banana',
      expect.objectContaining({
        prompt: 'Give me a variation of this image',
        inputImage: 'https://example.com/source.png',
      })
    )
  })
})
