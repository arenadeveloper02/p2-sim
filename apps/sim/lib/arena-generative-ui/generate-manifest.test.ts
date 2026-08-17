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

import {
  generateArenaGenerativeManifest,
  MODEL_JSON_PARSE_ERROR,
} from '@/lib/arena-generative-ui/generate-manifest'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

describe('generateArenaGenerativeManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Sonnet with a 16384 token cap', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 16_384,
      })
    )
  })

  it('maps truncated model JSON to a retry message instead of blaming User Input', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage('{"title":"Team","manifest":{"entryPath":"home","pages":{')
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory with home and person.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe(MODEL_JSON_PARSE_ERROR)
    expect(result.error).not.toBe('Value must be valid JSON')
  })

  it('maps a non-JSON model reply to the same retry message', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('I cannot generate that app.'))

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe(MODEL_JSON_PARSE_ERROR)
  })

  it('maps a non-object JSON payload to the retry message', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('"just a string"'))

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe(MODEL_JSON_PARSE_ERROR)
  })
})
