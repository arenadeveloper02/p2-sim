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

import { resolveImageCreatorIntent } from '@/lib/image-generation/resolve-image-creator-intent.server'

function mockSlmPromptRewrite(prompts: string[]) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  mode: 'variation',
                  prompts,
                }),
              },
            ],
          },
        },
      ],
    }),
  })
  global.fetch = mockFetch as unknown as typeof fetch
  return mockFetch
}

describe('resolveImageCreatorIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRotatingApiKey.mockReturnValue('test-google-key')
  })

  it('returns separate rewritten prompts for explicit variation counts', async () => {
    const originalPrompt = 'Create 3 variations of a yellow school bus'
    mockSlmPromptRewrite([
      'A yellow school bus, distinct variation 1',
      'A yellow school bus, distinct variation 2',
      'A yellow school bus, distinct variation 3',
    ])

    const result = await resolveImageCreatorIntent({ prompt: originalPrompt })

    expect(result.imageCount).toBe(3)
    expect(result.mode).toBe('variation')
    expect(result.singleImagePrompts).toHaveLength(3)
    expect(result.singleImagePrompts[0]).toContain('variation 1')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('detects edit mode when a reference image is provided', async () => {
    const originalPrompt = 'Add some students into it'
    mockSlmPromptRewrite(['Edit the provided reference image: Add some students into it.'])

    const result = await resolveImageCreatorIntent({
      prompt: originalPrompt,
      hasReferenceImage: true,
    })

    expect(result.imageCount).toBe(1)
    expect(result.mode).toBe('edit')
    expect(result.singleImagePrompts).toHaveLength(1)
  })

  it('falls back to distinct single-image prompts when SLM rewrite fails', async () => {
    const originalPrompt = 'Give me three separate variations of this logo'
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const result = await resolveImageCreatorIntent({ prompt: originalPrompt })

    expect(result.imageCount).toBe(3)
    expect(result.singleImagePrompts).toHaveLength(3)
    expect(result.singleImagePrompts[0]).toContain('exactly one distinct')
    expect(result.singleImagePrompts[1]).toContain('image 2 of 3')
  })
})
