/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDownloadFile } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
}))

vi.mock('@/lib/uploads/core/storage-service', () => ({
  downloadFile: mockDownloadFile,
}))

import { generateOpenAIImageEdit } from '@/lib/image-generation/openai-reference.server'

describe('generateOpenAIImageEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves internal absolute reference URLs from storage instead of fetching them', async () => {
    const referenceImage = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ])
    const generatedImage = Buffer.from('generated-image').toString('base64')
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: generatedImage }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    mockDownloadFile.mockResolvedValue(referenceImage)
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await generateOpenAIImageEdit('openai-key', {
      model: 'gpt-image-2',
      prompt: 'Use this as a reference',
      size: '1024x1024',
      quality: 'low',
      background: 'opaque',
      outputFormat: 'png',
      inputImage: 'https://dev-agent.thearena.ai/api/files/serve/execution/ws/wf/ex/source.png',
    })

    expect(result.buffer.toString()).toBe('generated-image')
    expect(mockDownloadFile).toHaveBeenCalledWith({
      key: 'execution/ws/wf/ex/source.png',
      context: 'execution',
      maxBytes: 20 * 1024 * 1024,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/images/edits')
  })
})
