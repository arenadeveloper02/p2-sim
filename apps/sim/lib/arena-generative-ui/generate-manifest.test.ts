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
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

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
        system: expect.not.stringContaining('statePath "content"'),
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

  it('passes stream: true into the bindings summary and streaming DataText rules', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Stream a summary onto the form page.',
      apiBindings: [
        {
          key: 'summarize',
          label: 'Summarize',
          kind: 'workflow',
          workflowId: 'wf-1',
          stream: true,
        },
      ],
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        system: expect.stringContaining('statePath "content"'),
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('"stream": true'),
          }),
        ],
      })
    )
  })

  it('omits the streaming DataText rule when no binding has stream: true', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [
        { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
      ],
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        system: expect.not.stringContaining('statePath "content"'),
      })
    )
  })

  it('recovers wrapper-level pages when nested manifest is a stub', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(
        JSON.stringify({
          title: 'Lead qualifier',
          content: 'ok',
          manifest: { entryPath: 'home' },
          pages: twoPageManifest.pages,
          actions: twoPageManifest.actions,
        })
      )
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Lead qualifier. Home is a form; Results shows the score.',
      apiBindings: [],
    })

    expect(result.success).toBe(true)
    expect(result.manifest?.entryPath).toBe('home')
    expect(result.manifest?.pages.home).toBeTruthy()
    expect(result.manifest?.pages.results).toBeTruthy()
  })

  it('returns a retry-or-pin message when the model omits pages', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(JSON.stringify({ title: 'Team', content: 'ok', manifest: { entryPath: 'home' } }))
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory with home and person.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('The generator omitted pages. Retry, or pin a JSON sitemap in Pages.')
    expect(result.error).not.toMatch(/keyed by page path/)
  })
})
