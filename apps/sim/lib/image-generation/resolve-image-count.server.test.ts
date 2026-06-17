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

import { resolveImageGenerationCount } from '@/lib/image-generation/resolve-image-count.server'

describe('resolveImageGenerationCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRotatingApiKey.mockReturnValue('test-google-key')
  })

  it('uses the explicit requested variation count even when Gemini returns a lower count', async () => {
    const originalPrompt =
      'Give 4 different variations with different jerseys, teams and fans wearing different players tshirts.'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    imageCount: 3,
                    imageUrl: null,
                  }),
                },
              ],
            },
          },
        ],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await resolveImageGenerationCount({
      prompt: originalPrompt,
    })

    expect(result.imageCount).toBe(4)
    expect(result.slmSuggested).toBe(3)
    expect(result.singleImagePrompt).toBe(originalPrompt)
    expect(result.singleImagePrompts).toEqual([
      originalPrompt,
      originalPrompt,
      originalPrompt,
      originalPrompt,
    ])

    const [, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>
      systemInstruction: { parts: Array<{ text: string }> }
    }
    expect(body.contents[0]?.parts[0]?.text).toBe(`Prompt:\n${originalPrompt}`)
    expect(body.systemInstruction.parts[0]?.text).toContain('imageCount must be that exact number')
    expect(body.systemInstruction.parts[0]?.text).not.toContain('singleImagePrompt')
  })

  it('preserves the original prompt when the SLM returns rewritten prompt fields in legacy payloads', async () => {
    const originalPrompt = 'A red sports car on a mountain road at sunset.'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    imageCount: 1,
                    imageUrl: null,
                    singleImagePrompt: 'Completely rewritten prompt from SLM',
                    singleImagePrompts: ['Rewritten variation 1'],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await resolveImageGenerationCount({ prompt: originalPrompt })

    expect(result.imageCount).toBe(1)
    expect(result.singleImagePrompt).toBe(originalPrompt)
    expect(result.singleImagePrompts).toEqual([originalPrompt])
  })
})
