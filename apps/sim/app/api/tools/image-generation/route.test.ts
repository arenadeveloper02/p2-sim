/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockExecuteTool } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockExecuteTool: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
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

  it('should route unified OpenAI requests through the server-key OpenAI image tool', async () => {
    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'Generate one product hero image',
        size: '1024x1024',
        quality: 'low',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'openai_image',
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: 'Generate one product hero image',
        size: '1024x1024',
        quality: 'low',
      })
    )
  })

  it('should route unified Gemini requests through Nano Banana with block reference images', async () => {
    const originalPrompt = 'Edit this into a studio shot'
    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'gemini',
        model: 'gemini-3-pro-image-preview',
        prompt: originalPrompt,
        inputImageUrl: 'https://example.com/source.png',
        resolution: '2K',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'google_nano_banana',
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-3-pro-image-preview',
        prompt: originalPrompt,
        inputImage: 'https://example.com/source.png',
        imageSize: '2K',
      })
    )
  })

  it('should route unified Fal.ai requests through direct image_generate execution', async () => {
    mockExecuteTool.mockResolvedValue({
      success: true,
      output: {
        image: 'https://example.com/falai.png',
        provider: 'falai',
        model: 'nano-banana-2',
        metadata: { provider: 'falai', model: 'nano-banana-2' },
        __falaiCostDollars: 0.1,
        __falaiBilling: { endpointId: 'fal-ai/nano-banana-2', requestId: 'fal-123' },
      },
    })

    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'falai',
        apiKey: 'fal-key',
        model: 'nano-banana-2',
        prompt: 'Generate one image',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'image_generate',
      expect.objectContaining({
        provider: 'falai',
        apiKey: 'fal-key',
        model: 'nano-banana-2',
        __skipSmartWrapper: true,
        __skipHostedKeyHandling: true,
      })
    )
    expect(data.output).toMatchObject({
      image: 'https://example.com/falai.png',
      imageUrl: 'https://example.com/falai.png',
      provider: 'falai',
      model: 'nano-banana-2',
      __falaiCostDollars: 0.1,
    })
  })

  it('should return a helpful error for truncated inline image JSON payloads', async () => {
    const request = new NextRequest('http://localhost:3000/api/tools/image-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"baseToolId":"google_nano_banana","params":{"model":"gemini-3-pro-image-preview","prompt":"Edit this","inputImage":"',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(413)
    expect(data).toMatchObject({
      success: false,
      error: expect.stringContaining('upload the reference image as a file or use an image URL'),
    })
    expect(mockExecuteTool).not.toHaveBeenCalled()
  })

  it('should route image_generate OpenAI requests without references to openai_image', async () => {
    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'A red sports car',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'openai_image',
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: 'A red sports car',
      })
    )
  })

  it('should route image_generate OpenAI requests with references to direct image_generate', async () => {
    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'Edit this image',
        inputImage: 'https://example.com/source.png',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'image_generate',
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: 'Edit this image',
        inputImage: 'https://example.com/source.png',
        __skipSmartWrapper: true,
        __skipHostedKeyHandling: true,
      })
    )
  })

  it('should route image_generate Gemini requests to google_nano_banana', async () => {
    const request = createMockRequest('POST', {
      baseToolId: 'image_generate',
      params: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A blue bird',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'google_nano_banana',
      expect.objectContaining({
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'A blue bird',
      })
    )
  })
})
