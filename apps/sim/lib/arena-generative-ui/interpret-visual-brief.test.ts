/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateAnthropicMessage } = vi.hoisted(() => ({
  mockCreateAnthropicMessage: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {},
}))

vi.mock('@/lib/anthropic/create-message', () => ({
  createAnthropicMessage: mockCreateAnthropicMessage,
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: () => 'test-key',
}))

vi.mock('@/providers/utils', () => ({
  getMaxOutputTokensForModel: () => 128_000,
  supportsTemperature: () => true,
}))

import { interpretArenaGenerativeVisualBrief } from '@/lib/arena-generative-ui/interpret-visual-brief'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

const image = {
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'aaaa' },
}

const validReply = {
  screens: [
    {
      purpose: 'Lead intake form',
      archetype: 'task',
      visibleCopy: ['Company', 'Submit'],
      fields: [{ name: 'company', label: 'Company' }],
      ctas: ['Submit'],
    },
  ],
  layout: { density: 'comfortable', colorScheme: 'light' },
  catalogMapping: [],
  unrepresentable: [],
}

describe('interpretArenaGenerativeVisualBrief', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a parsed brief and sends the image as a content block', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(validReply)))

    const interpreted = await interpretArenaGenerativeVisualBrief({
      images: [image],
      userInput: 'Match this mock.',
    })

    expect(interpreted.brief?.screens[0]?.archetype).toBe('task')
    const content = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0]
      .content as Array<{ type: string }>
    expect(content[0]?.type).toBe('text')
    expect(content[1]).toEqual(image)
  })

  it('fails open on invalid JSON', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
    const interpreted = await interpretArenaGenerativeVisualBrief({ images: [image] })
    expect(interpreted.brief).toBeNull()
    expect(interpreted.error).toBeTruthy()
  })

  it('requires at least one image', async () => {
    const interpreted = await interpretArenaGenerativeVisualBrief({ images: [] })
    expect(interpreted.brief).toBeNull()
    expect(interpreted.error).toContain('screenshots')
  })
})
