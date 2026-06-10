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
                    singleImagePrompt:
                      'Give me a different variation with different jerseys, teams and fans wearing different players shirts.',
                    singleImagePrompts: [
                      'Give me variation 1 with blue home jerseys and home fans.',
                      'Give me variation 2 with red away jerseys and rival fans.',
                      'Give me variation 3 with green alternate jerseys and mixed fans.',
                      'Give me variation 4 with white retro jerseys and celebratory fans.',
                    ],
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
      prompt:
        'Give 4 different variations with different jerseys, teams and fans wearing different players tshirts.',
    })

    expect(result.imageCount).toBe(4)
    expect(result.slmSuggested).toBe(3)
    expect(result.singleImagePrompts).toEqual([
      'Give me variation 1 with blue home jerseys and home fans.',
      'Give me variation 2 with red away jerseys and rival fans.',
      'Give me variation 3 with green alternate jerseys and mixed fans.',
      'Give me variation 4 with white retro jerseys and celebratory fans.',
    ])

    const [, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>
      systemInstruction: { parts: Array<{ text: string }> }
    }
    expect(body.contents[0]?.parts[0]?.text).toBe(
      'Prompt:\nGive 4 different variations with different jerseys, teams and fans wearing different players tshirts.'
    )
    expect(body.systemInstruction.parts[0]?.text).toContain('imageCount must be that exact number')
    expect(body.systemInstruction.parts[0]?.text).toContain(
      'make every singleImagePrompts entry meaningfully different'
    )
  })
})
