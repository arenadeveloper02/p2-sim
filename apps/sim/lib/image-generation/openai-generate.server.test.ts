/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetRotatingApiKey } = vi.hoisted(() => ({
  mockGetRotatingApiKey: vi.fn(),
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: mockGetRotatingApiKey,
}))

vi.mock('@/lib/uploads/utils/image-storage.server', () => ({
  saveGeneratedImage: vi.fn().mockResolvedValue({ url: 'https://example.com/generated.png' }),
}))

import { generateOpenAIImageToolResponse } from '@/lib/image-generation/openai-generate.server'

describe('generateOpenAIImageToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRotatingApiKey.mockReturnValue('test-openai-key')
  })

  it('calls the OpenAI generations API directly without secureFetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ b64_json: Buffer.from('fake-image').toString('base64') }],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await generateOpenAIImageToolResponse({
      model: 'gpt-image-1.5',
      prompt: 'kangaroo',
      size: 'auto',
      quality: 'auto',
      background: 'auto',
      moderation: 'auto',
      outputFormat: 'png',
      _context: { workflowId: 'wf-1', userId: 'user-1' },
    })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
      'https://api.openai.com/v1/images/generations'
    )
    expect(mockGetRotatingApiKey).toHaveBeenCalledWith('openai')
  })
})
