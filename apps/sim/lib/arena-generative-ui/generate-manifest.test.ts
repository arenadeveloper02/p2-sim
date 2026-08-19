/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateAnthropicMessage, mockPlanBrief } = vi.hoisted(() => ({
  mockCreateAnthropicMessage: vi.fn(),
  mockPlanBrief: vi.fn(),
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

vi.mock('@/lib/arena-generative-ui/structured-brief', () => ({
  planArenaGenerativeStructuredBrief: mockPlanBrief,
  archetypeRecipe: (archetype: string) => `ARCHETYPE RECIPE: ${archetype}`,
  formatStructuredBriefForGenerator: (brief: { title: string }) =>
    `Structured brief (implement this information architecture; emit exactly these page paths as object keys):\n${JSON.stringify(brief, null, 2)}`,
  pageHintsFromStructuredBrief: (brief: {
    pages: Array<{ path: string; title: string; purpose: string }>
  }) => brief.pages.map((page) => ({ path: page.path, title: page.title, purpose: page.purpose })),
}))

import {
  EDIT_PRESERVATION_INSTRUCTION,
  generateArenaGenerativeManifest,
  MODEL_JSON_PARSE_ERROR,
  SCOPED_EDIT_INSTRUCTION,
} from '@/lib/arena-generative-ui/generate-manifest'
import { ARENA_GENERATIVE_UI_GOLD_EXAMPLE } from '@/lib/arena-generative-ui/gold-example'
import {
  multiPageApiBindings,
  multiPageManifest,
} from '@/lib/arena-generative-ui/multi-page-app.fixture'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import {
  GENERATOR_OMITTED_PAGES_ERROR,
  validateArenaGenerativeManifest,
} from '@/lib/arena-generative-ui/validate-manifest'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

describe('generateArenaGenerativeManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPlanBrief.mockResolvedValue(null)
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
    expect(system).toContain('Repeat')
    expect(system).toContain('PageHeader')
    expect(system).toContain('Tabs')
    expect(system).toContain('NumberInput')
    expect(system).toContain('showWhen')
    expect(system).toContain('MultiSelect')
    expect(system).toContain('Load more')
    expect(system).toContain('manifest.theme')
    expect(system).toContain('brandColor')
    expect(system).toContain('#1A73E8')
    expect(system).toContain('always emit manifest.theme')
    expect(system).toContain('ARENA DESIGN SYSTEM')
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
    expect(system).toContain('Load more')
    expect(system).toContain('hasMore')

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

  describe('two-stage generation', () => {
    const plannedBrief = {
      title: 'Orders',
      purpose: 'Browse orders and open one record.',
      audience: 'Ops',
      archetype: 'list-detail' as const,
      entryPath: 'home',
      pages: [
        {
          path: 'home',
          title: 'Orders',
          purpose: 'Collection',
          data: 'onLoad load_orders into orders',
          actions: ['load_orders'],
          emptyCopy: 'No orders yet.',
        },
        {
          path: 'detail',
          title: 'Order',
          purpose: 'Record',
          data: 'onLoad load_order from ?id',
          actions: ['load_order'],
        },
      ],
      actions: [],
    }

    it('plans a structured brief before asking for the manifest', async () => {
      mockPlanBrief.mockResolvedValue(plannedBrief)
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
      })

      expect(mockPlanBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'Order inbox with a detail page.',
        })
      )
      expect(mockPlanBrief.mock.invocationCallOrder[0]).toBeLessThan(
        mockCreateAnthropicMessage.mock.invocationCallOrder[0]
      )
    })

    it('skips planning when editing an existing manifest', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Centre the search row.',
        apiBindings: [],
        existingManifest: twoPageManifest,
      })

      expect(mockPlanBrief).not.toHaveBeenCalled()
    })

    it('selects the archetype recipe and contracts the sitemap to the brief', async () => {
      mockPlanBrief.mockResolvedValue(plannedBrief)
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [],
      })

      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(system).toContain('ARCHETYPE RECIPE: list-detail')
      expect(system).toContain('GOLD STANDARD REFERENCE LAYOUT')
      expect(payload).toContain('Structured brief')
      expect(payload).toContain('"archetype": "list-detail"')
      expect(payload).toContain('Requested pages')
      expect(payload).toContain('"path": "detail"')
      expect(payload).toContain('Requested entryPath: home')
      expect(payload).not.toContain('Infer a small coherent sitemap')
    })

    it('uses the planned page count for the manifest output budget', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Two page app.',
        apiBindings: [],
      })
      const assumedBudget = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number

      vi.clearAllMocks()
      mockPlanBrief.mockResolvedValue(plannedBrief)
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [],
      })
      const plannedBudget = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number

      expect(plannedBudget).toBeLessThan(assumedBudget)
    })

    it('still generates when planning returns nothing', async () => {
      mockPlanBrief.mockResolvedValue(null)
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
      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      expect(system).not.toContain('ARCHETYPE RECIPE:')
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

  /**
   * These drive the real scoping call through the shared `createAnthropicMessage`
   * mock: on a manifest large enough to scope, call 0 is the scope call and call 1
   * is the manifest call.
   */
  describe('scoped edit', () => {
    const scopeReply = (overrides: Record<string, unknown> = {}) =>
      textMessage(
        JSON.stringify({
          mode: 'pages',
          pages: ['results'],
          pageSetStable: true,
          touchesActions: false,
          touchesTheme: false,
          ...overrides,
        })
      )

    const editedResults = {
      path: 'results',
      title: 'Score',
      spec: {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Score' }, children: ['stat'] },
          stat: {
            type: 'Stat',
            props: { label: 'Score', statePath: 'score' },
            children: [],
          },
        },
      },
    }

    function manifestCall() {
      return mockCreateAnthropicMessage.mock.calls[1]?.[1]
    }

    it('sends only the scoped page spec plus a summary of the rest', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply())
        .mockResolvedValueOnce(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      const payload = manifestCall().messages[0].content as string
      expect(payload).toContain(SCOPED_EDIT_INSTRUCTION)
      expect(payload).toContain('Pages to change')
      expect(payload).toContain('"results"')
      expect(payload).toContain('DO NOT return these')
      expect(payload).not.toContain('Existing manifest:')
      expect(payload).not.toContain(EDIT_PRESERVATION_INSTRUCTION)
    })

    it('withholds the untouched page specs while keeping their nav targets visible', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply())
        .mockResolvedValueOnce(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      const payload = manifestCall().messages[0].content as string
      expect(payload).not.toContain('Qualify a lead')
      expect(payload).toContain('"navigatesTo"')
      expect(payload).toContain('"dashboard"')
    })

    it('drops the output budget to the scoped page count', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply())
        .mockResolvedValueOnce(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })
      const scopedBudget = manifestCall().max_tokens as number

      vi.clearAllMocks()
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply({ mode: 'global', pages: [] }))
        .mockResolvedValueOnce(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Use a dark theme everywhere.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })
      const globalBudget = manifestCall().max_tokens as number

      expect(scopedBudget).toBeLessThan(globalBudget)
    })

    /**
     * A stored draft manifest is validator output, so the baseline here is the
     * fixture run through the validator once — exactly what an edit loads from the
     * database. That makes the byte comparison the same one production performs.
     */
    it('keeps every untouched page byte-identical through the merge', async () => {
      const stored = validateArenaGenerativeManifest(multiPageManifest, {
        apiBindings: multiPageApiBindings,
      }).manifest
      expect(stored).toBeDefined()
      if (!stored) return

      mockCreateAnthropicMessage.mockResolvedValueOnce(scopeReply()).mockResolvedValueOnce(
        textMessage(
          JSON.stringify({
            title: 'Lead qualifier',
            content: 'Updated results.',
            manifest: { pages: { results: editedResults } },
          })
        )
      )

      const result = await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: stored,
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
      const pages = result.manifest?.pages
      expect(Object.keys(pages ?? {}).sort()).toEqual(['dashboard', 'home', 'results', 'settings'])
      for (const path of ['home', 'dashboard', 'settings'] as const) {
        expect(JSON.stringify(pages?.[path])).toBe(JSON.stringify(stored.pages[path]))
      }
      expect(JSON.stringify(pages?.results)).not.toBe(JSON.stringify(stored.pages.results))
      expect(result.manifest?.entryPath).toBe('home')
      expect(result.manifest?.actions).toEqual(stored.actions)
    })

    it('asks for a correction when the reply returns a page outside the scope', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply())
        .mockResolvedValueOnce(
          textMessage(
            JSON.stringify({
              manifest: {
                pages: { results: editedResults, home: multiPageManifest.pages.home },
              },
            })
          )
        )
        .mockResolvedValueOnce(
          textMessage(JSON.stringify({ manifest: { pages: { results: editedResults } } }))
        )

      const result = await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      expect(result.success).toBe(true)
      const repair = mockCreateAnthropicMessage.mock.calls[2]?.[1].messages.at(-1)
        ?.content as string
      expect(repair).toContain('was not in scope')
      expect(repair).toContain('only these page keys')
    })

    it('falls back to the full manifest edit when scoping fails', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(textMessage('not a scope object'))
        .mockResolvedValueOnce(textMessage('not a scope object'))
        .mockResolvedValueOnce(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      const payload = mockCreateAnthropicMessage.mock.calls[2]?.[1].messages[0].content as string
      expect(payload).toContain(EDIT_PRESERVATION_INSTRUCTION)
      expect(payload).toContain('Existing manifest:')
      expect(payload).not.toContain(SCOPED_EDIT_INSTRUCTION)
    })

    it('pins the current page set on a global edit that keeps it stable', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply({ mode: 'global', pages: [], pageSetStable: true }))
        .mockResolvedValueOnce(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Use a dark theme everywhere.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      const payload = manifestCall().messages[0].content as string
      expect(payload).toContain('Requested pages')
      expect(payload).toContain('"path": "settings"')
      expect(payload).not.toContain('Keep exactly the pages in the existing manifest')
    })

    it('leaves the page set open when the edit adds or removes a page', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(scopeReply({ mode: 'global', pages: [], pageSetStable: false }))
        .mockResolvedValueOnce(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Add an audit page.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
      })

      const payload = manifestCall().messages[0].content as string
      expect(payload).not.toContain('Requested pages')
      expect(payload).toContain('Keep exactly the pages in the existing manifest')
    })

    it('spends no scoping call when the user pinned a sitemap', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'On results, show the score as a Stat.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
        pages: [
          { path: 'home', title: 'Leads' },
          { path: 'results', title: 'Score' },
        ],
      })

      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(1)
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(payload).toContain(EDIT_PRESERVATION_INSTRUCTION)
      expect(payload).not.toContain(SCOPED_EDIT_INSTRUCTION)
    })
  })
})
