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
  EDIT_PRESERVATION_INSTRUCTION,
  generateArenaGenerativeManifest,
  MODEL_JSON_PARSE_ERROR,
} from '@/lib/arena-generative-ui/generate-manifest'
import { ARENA_GENERATIVE_UI_GOLD_EXAMPLE } from '@/lib/arena-generative-ui/gold-example'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import { GENERATOR_OMITTED_PAGES_ERROR } from '@/lib/arena-generative-ui/validate-manifest'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

describe('generateArenaGenerativeManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Sonnet with a budget well above a single truncating page', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: expect.any(Number),
        system: expect.not.stringContaining('statePath "content"'),
      })
    )
    const maxTokens = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number
    expect(maxTokens).toBeGreaterThan(16_384)
  })

  it('scales the output budget with the number of pages it has to emit', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Two page app.',
      apiBindings: [],
      pages: [
        { path: 'home', title: 'Home' },
        { path: 'results', title: 'Results' },
      ],
    })
    await generateArenaGenerativeManifest({
      userInput: 'Six page app.',
      apiBindings: [],
      pages: Array.from({ length: 6 }, (_, index) => ({
        path: `page-${index + 1}`,
        title: `Page ${index + 1}`,
      })),
    })

    const twoPageBudget = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number
    const sixPageBudget = mockCreateAnthropicMessage.mock.calls[1]?.[1].max_tokens as number
    expect(sixPageBudget).toBeGreaterThan(twoPageBudget)
  })

  it('never asks for more output tokens than the model supports', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Huge app.',
      apiBindings: [],
      pages: Array.from({ length: 60 }, (_, index) => ({
        path: `page-${index + 1}`,
        title: `Page ${index + 1}`,
      })),
    })

    const maxTokens = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number
    expect(maxTokens).toBeLessThanOrEqual(128_000)
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

  it('asks for wide dense layouts instead of a narrow single column', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).not.toContain('640px')
    expect(system).not.toContain('Single column only')
    expect(system).not.toContain('iframe-narrow')
    expect(system).not.toContain('single column')
    expect(system).not.toContain('one Card')
    expect(system).not.toContain('one primary CTA per page')
    expect(system).not.toContain('full-page app shell')
    expect(system).toContain('Grid')
    expect(system).toContain('Table')
    expect(system).toContain('PageHeader')
    expect(system).toContain('Tabs')
  })

  it('opens with the engineer persona and a no-markdown instruction', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system.startsWith('You are an expert principal frontend engineer')).toBe(true)
    expect(system).toContain('no markdown fences')
  })

  it('appends the gold standard reference layout', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
    expect(system).toContain('"entryPath": "home"')
    expect(system).toContain('"type": "PageHeader"')
  })

  it('carries the design constraints translated from the master template', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('there are exactly two')
    expect(system).toContain('never size words like "md" or "lg"')
    expect(system).toContain('Never let prose run the full 1280px')
    expect(system).toContain('nest levels sequentially')
    expect(system).toContain('every interactive field carries an explicit label')
    expect(system).toContain('Skeleton')
  })

  it('drops the old rule that told the model to paint backgrounds', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).not.toContain('default grey dump')
    expect(system).not.toContain('calm palette')
  })

  it('explains how a CTA response maps to statePath when bindings are declared', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Recommend articles.',
      apiBindings: [
        {
          key: 'recommend_articles',
          label: 'Recommend',
          kind: 'workflow',
          workflowId: 'wf-1',
          outputSchema: [
            { name: 'articles', type: 'array' },
            { name: 'articles[].title', type: 'string' },
          ],
        },
      ],
    })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('top-level keys into app state')
    expect(system).toContain('never "data.articles"')
    expect(system).toContain('outputSchema')

    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('articles[].title')
  })

  it('omits the CTA result rule when there are no bindings', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Static brochure.',
      apiBindings: [],
    })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).not.toContain('top-level keys into app state')
  })

  it('passes stream: true into the bindings summary and localized streaming rules', async () => {
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
    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('onSuccess.navigate')
    expect(system).toContain('only when the user asked')
    expect(system).toContain('outputSchema')
    expect(system).toContain('Table statePath="companies"')
    expect(system).not.toContain('use one page')
    expect(system).not.toContain('Omit onSuccess.navigate')
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

  it('retries once when the first reply omits pages', async () => {
    mockCreateAnthropicMessage
      .mockResolvedValueOnce(
        textMessage(
          JSON.stringify({ title: 'Team', content: 'ok', manifest: { entryPath: 'home' } })
        )
      )
      .mockResolvedValueOnce(
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
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
    expect(mockCreateAnthropicMessage.mock.calls[1]?.[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('manifest.pages must be a non-empty object'),
        }),
      ])
    )
  })

  it('returns a retry-or-pin message when every reply omits pages', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(JSON.stringify({ title: 'Team', content: 'ok', manifest: { entryPath: 'home' } }))
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory with home and person.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(3)
    expect(result.error).toBe(GENERATOR_OMITTED_PAGES_ERROR)
    expect(result.error).not.toMatch(/keyed by page path/)
  })

  it('repairs a spec that references an undeclared API key instead of failing outright', async () => {
    const brokenManifest = {
      entryPath: 'home',
      pages: twoPageManifest.pages,
      actions: { qualify: { apiKey: 'invented_key' } },
    }
    mockCreateAnthropicMessage
      .mockResolvedValueOnce(
        textMessage(JSON.stringify({ title: 'Lead', content: 'ok', manifest: brokenManifest }))
      )
      .mockResolvedValueOnce(
        textMessage(
          JSON.stringify({
            title: 'Lead',
            content: 'ok',
            manifest: {
              entryPath: 'home',
              pages: twoPageManifest.pages,
              actions: {
                submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
              },
            },
          })
        )
      )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Lead qualifier.',
      apiBindings: [
        { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
      ],
    })

    expect(result.success).toBe(true)
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
    const repairTurn = mockCreateAnthropicMessage.mock.calls[1]?.[1].messages.at(-1) as {
      role: string
      content: string
    }
    expect(repairTurn.role).toBe('user')
    expect(repairTurn.content).toContain('failed validation')
    expect(repairTurn.content).toContain('invented_key')
    expect(repairTurn.content).toContain('keep every other page')
  })

  it('stops repairing after two attempts and returns the last validation error', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(
        JSON.stringify({
          title: 'Lead',
          content: 'ok',
          manifest: {
            entryPath: 'home',
            pages: twoPageManifest.pages,
            actions: { qualify: { apiKey: 'invented_key' } },
          },
        })
      )
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Lead qualifier.',
      apiBindings: [
        { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('invented_key')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(3)
  })

  it('tells the model to use declared binding keys when Pages is empty', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Call gererate_reccomendations on submit.',
      apiBindings: [
        { key: 'recommend_articles', label: 'Recommend', kind: 'workflow', workflowId: 'wf-1' },
      ],
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('recommend_articles'),
          }),
        ],
      })
    )
  })

  describe('edit mode', () => {
    async function editPayload(
      params: Partial<Parameters<typeof generateArenaGenerativeManifest>[0]> = {}
    ): Promise<string> {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Centre the search row.',
        apiBindings: [],
        existingManifest: twoPageManifest,
        ...params,
      })
      return mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    }

    it('demands only the requested changes instead of a fresh app', async () => {
      const payload = await editPayload()

      expect(payload).toContain(EDIT_PRESERVATION_INSTRUCTION)
      expect(payload).toContain('Requested changes:\nCentre the search row.')
      expect(payload).not.toContain('Mode: generate a new multi-page app.')
      expect(payload).not.toContain('User request:')
    })

    it('keeps the existing pages and entryPath when neither is pinned', async () => {
      const payload = await editPayload()

      expect(payload).toContain('Keep exactly the pages in the existing manifest')
      expect(payload).toContain('Keep the existing manifest entryPath')
      expect(payload).not.toContain('Infer a small coherent sitemap')
    })

    it('still honours a pinned sitemap and entryPath', async () => {
      const payload = await editPayload({
        pages: [{ path: 'home', title: 'Form' }],
        entryPath: 'home',
      })

      expect(payload).toContain('Requested pages')
      expect(payload).toContain('Requested entryPath: home')
      expect(payload).not.toContain('Keep exactly the pages in the existing manifest')
      expect(payload).not.toContain('Keep the existing manifest entryPath')
    })

    it('sends the original brief as context that must not be re-applied', async () => {
      const payload = await editPayload({ existingBrief: 'Lead qualifier with a results page.' })

      expect(payload).toContain('Original brief (context only')
      expect(payload).toContain('Lead qualifier with a results page.')
      expect(payload.indexOf('Original brief')).toBeLessThan(payload.indexOf('Requested changes:'))
    })

    it('omits the brief section entirely when the draft has none', async () => {
      const payload = await editPayload()

      expect(payload).not.toContain('Original brief')
    })

    it('leaves generate mode untouched', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Team directory.',
        apiBindings: [],
        existingBrief: 'ignored without a manifest',
      })
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string

      expect(payload).toContain('Mode: generate a new multi-page app.')
      expect(payload).toContain('User request:\nTeam directory.')
      expect(payload).toContain('Infer a small coherent sitemap')
      expect(payload).not.toContain('Original brief')
    })
  })

  it('rewrites opaque model fetch failed into a retryable network error', async () => {
    mockCreateAnthropicMessage.mockRejectedValue(new TypeError('fetch failed'))

    const result = await generateArenaGenerativeManifest({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe(
      'Model request failed (connection closed or timed out). Retry the run.'
    )
  })
})
