/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateAnthropicMessage, mockPlanBrief, mockAnalyzeIntent, mockCritique } = vi.hoisted(
  () => ({
    mockCreateAnthropicMessage: vi.fn(),
    mockPlanBrief: vi.fn(),
    mockAnalyzeIntent: vi.fn(),
    mockCritique: vi.fn(),
  })
)

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
  shellRecipe: (shell?: { navigation?: string }) =>
    shell?.navigation && shell.navigation !== 'none' && shell.navigation !== 'minimal'
      ? 'SHELL RECIPE'
      : '',
  recipesForBlueprint: (brief: {
    archetype: string
    pages?: Array<{ archetype?: string }>
    shell?: { navigation?: string }
  }) => {
    const shapes = new Set<string>([brief.archetype])
    for (const page of brief.pages ?? []) {
      if (page.archetype) shapes.add(page.archetype)
    }
    const recipes = [...shapes].map((shape) => `ARCHETYPE RECIPE: ${shape}`)
    if (
      brief.shell?.navigation &&
      brief.shell.navigation !== 'none' &&
      brief.shell.navigation !== 'minimal'
    ) {
      recipes.push('SHELL RECIPE')
    }
    return recipes.join('\n\n')
  },
  archetypeRecipesForBrief: (brief: {
    archetype: string
    pages?: Array<{ archetype?: string }>
    shell?: { navigation?: string }
  }) => {
    const shapes = new Set<string>([brief.archetype])
    for (const page of brief.pages ?? []) {
      if (page.archetype) shapes.add(page.archetype)
    }
    const recipes = [...shapes].map((shape) => `ARCHETYPE RECIPE: ${shape}`)
    if (
      brief.shell?.navigation &&
      brief.shell.navigation !== 'none' &&
      brief.shell.navigation !== 'minimal'
    ) {
      recipes.push('SHELL RECIPE')
    }
    return recipes.join('\n\n')
  },
  briefHasDummyOrLocalData: (brief?: { pages?: Array<{ data?: string; dataMode?: string }> }) =>
    Boolean(
      brief?.pages?.some(
        (page) =>
          page.dataMode === 'dummy' ||
          page.dataMode === 'local' ||
          (typeof page.data === 'string' && /\bdummy\b/i.test(page.data))
      )
    ),
  formatStructuredBriefForGenerator: (brief: { title: string }) =>
    `Structured brief (implement this information architecture; emit exactly these page paths as object keys):\n${JSON.stringify(brief, null, 2)}`,
  formatStructuredBriefForEdit: (brief: { title: string; archetype: string }) =>
    `Original structured brief (context only — already implemented. Do not re-apply the sitemap, archetype, or copy unless the change request asks.):\n${JSON.stringify(brief, null, 2)}`,
  pageHintsFromStructuredBrief: (brief: {
    pages: Array<{ path: string; title: string; purpose: string }>
  }) => brief.pages.map((page) => ({ path: page.path, title: page.title, purpose: page.purpose })),
}))

vi.mock('@/lib/arena-generative-ui/intent-analyzer', () => ({
  analyzeArenaGenerativeIntent: mockAnalyzeIntent,
}))

vi.mock('@/lib/arena-generative-ui/critique-manifest', () => ({
  critiqueArenaGenerativeManifest: mockCritique,
  mustFixCriticIssues: (critique: { issues?: Array<{ severity: string }> }) =>
    (critique.issues ?? []).filter((issue) => issue.severity === 'must-fix'),
  formatCriticRepairError: (
    issues: Array<{ category: string; page?: string; message: string; fixHint: string }>
  ) =>
    issues
      .map((issue, index) => {
        const page = issue.page ? `page "${issue.page}"` : 'app'
        return `${index + 1}. UI critic must-fix (${issue.category}) on ${page}: ${issue.message} ${issue.fixHint}`
      })
      .join('\n'),
}))

import {
  EDIT_PRESERVATION_INSTRUCTION,
  formatHostCriticRepairError,
  generateArenaGenerativeManifest,
  HOST_CRITIC_REPAIR_ISSUE_CAP,
  MAX_REPAIR_ATTEMPTS,
  MODEL_JSON_PARSE_ERROR,
  REPLAN_GENERATE_INSTRUCTION,
  SCOPED_EDIT_INSTRUCTION,
} from '@/lib/arena-generative-ui/generate-manifest'
import { ARENA_GENERATIVE_UI_GOLD_EXAMPLE } from '@/lib/arena-generative-ui/gold-example'
import { ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL } from '@/lib/arena-generative-ui/gold-example-archetypes'
import {
  multiPageApiBindings,
  multiPageManifest,
} from '@/lib/arena-generative-ui/multi-page-app.fixture'
import {
  twoPageApiBindings,
  twoPageManifest,
  twoPageResultsSpec,
} from '@/lib/arena-generative-ui/two-page-app.fixture'
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
    mockPlanBrief.mockResolvedValue({ brief: null })
    mockAnalyzeIntent.mockResolvedValue({ intent: null })
    mockCritique.mockResolvedValue({ pass: true, issues: [] })
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
    expect(maxTokens).toBe(128_000)
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
    expect(system).not.toContain('one Card')
    expect(system).not.toContain('one primary CTA per page')
    expect(system).not.toContain('full-page app shell')
    expect(system).toContain('full page up to 1280px')
    expect(system).toContain('narrow Arena iframe')
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
    expect(system).toContain('UNIVERSAL UI/UX CONSTITUTION')
    expect(system).toContain('DESIGN RULES / TOKENS')
    expect(system).toContain('UX RULES / STATES')
    expect(system).toContain('DESIGN GUIDELINES')
    expect(system).toContain('DESIGN INTENT')
    expect(system).toContain('COMPONENT SELECTION RULES')
    expect(system).not.toContain('PROFESSIONAL LAYOUT')
    expect(system).not.toContain('UI CRITIC')
    expect(system).toContain('ANTI-PATTERNS')
    expect(system).toContain('COMPONENT RULES')
    expect(system).toContain('DATA STATE CONTRACT')
    expect(system).toContain('ACTION CONTRACT')
    expect(system).toContain('INTERACTION / STATE RULES')
    expect(system).toContain('HOST UX')
    expect(system).toContain('WorkingCard')
    expect(system).not.toContain('PROCESSING PATTERN')
    expect(system).not.toContain('CAPABILITY: LONG-RUNNING')
  })

  it('opens with the engineer persona and a no-markdown instruction', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system.startsWith('You are an expert principal frontend engineer')).toBe(true)
    expect(system).toContain('dashboards, multi-step forms, and operational tools')
    expect(system).toContain('Implement the structured brief as a finished product')
    expect(system).toContain('unsaid production details')
    expect(system).not.toContain('enterprise research platforms')
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
    expect(system).toContain('spacing tokens')
    expect(system).toContain('Never let prose run the full 1280px')
    expect(system).toContain('nest levels sequentially')
    expect(system).toContain('every interactive field carries an explicit label')
    expect(system).toContain('Skeleton')
  })

  it('tells the model the host compiles UX and not to emit fake progress', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({ userInput: 'Team directory.', apiBindings: [] })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('HOST UX')
    expect(system).toContain('ACTION CONTRACT')
    expect(system).toContain('Do not emit ProgressSteps')
    expect(system).toContain('ANTI-PATTERNS')
    expect(system).toContain('Never hard-code dynamic data')
    expect(system).not.toContain('only when the user asked')
    expect(system).not.toContain('ProgressBar and ProgressSteps belong')
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
    expect(system).toContain('each binding includes layoutPlan')
    expect(system).toContain('never "data.articles"')
    expect(system).toContain('never "field.content"')
    expect(system).toContain('must not onLoad that same action')
    expect(system).toContain('Submitted form fields land in host state under "inputs"')
    expect(system).toContain('{targetKeyword}')
    expect(system).toContain('not History row keys')
    expect(system).toContain('outputSchema')
    expect(system).toContain('selectItem')
    expect(system).toContain('clearItem')
    expect(system).toContain('!selectedId')
    expect(system).toContain('Same-page History')
    expect(system).toContain('Cross-page History')
    expect(system).toContain('Load more')
    expect(system).toContain('hasMore')
    expect(system).toContain('host pages Table and Repeat locally')

    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('articles[].title')
    expect(userMessage).toContain('"outputExample"')
    expect(userMessage).toContain('"layoutPlan"')
    expect(userMessage).toContain('bind layoutPlan.hostKeys as statePath')
  })

  it('omits the CTA result rule when there are no bindings', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    await generateArenaGenerativeManifest({
      userInput: 'Static brochure.',
      apiBindings: [],
    })

    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).not.toContain('each binding includes layoutPlan')
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
          outputHint: '# Company analysis',
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
    expect(system).toContain('Do not emit ProgressSteps')
    expect(system).not.toContain('only when the user asked')
    expect(system).toContain('outputSchema')
    expect(system).toContain('outputHint')
    expect(system).toContain('Table statePath="companies"')
    expect(system).not.toContain('use one page')
    expect(system).not.toContain('Omit onSuccess.navigate')
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('# Company analysis')
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
        system: expect.not.stringContaining('If a declared API binding has stream: true'),
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

  it('recovers wrapper-level actions when nested manifest already has pages', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(
      textMessage(
        JSON.stringify({
          title: 'Lead qualifier',
          content: 'ok',
          manifest: {
            entryPath: 'home',
            pages: twoPageManifest.pages,
          },
          actions: twoPageManifest.actions,
        })
      )
    )

    const result = await generateArenaGenerativeManifest({
      userInput: 'Lead qualifier. Home is a form; Results shows the score.',
      apiBindings: twoPageApiBindings,
    })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.manifest?.actions.submit_lead).toBeTruthy()
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
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS + 1)
    expect(result.error).toContain(GENERATOR_OMITTED_PAGES_ERROR)
    expect(result.error).toContain('Could not generate a valid app after 3 repair attempts.')
    expect(result.error).toContain('What you can do:')
    expect(result.error).toContain('Pin a JSON sitemap')
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

  it('stops repairing after three attempts and returns a user-facing validation error', async () => {
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
    expect(result.error).toContain('Could not generate a valid app after 3 repair attempts.')
    expect(result.error).toContain('What still needs to be fixed:')
    expect(result.error).toContain('What you can do:')
    expect(result.error).toContain('API Bindings')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS + 1)
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
      expect(payload).toContain('destination and collection pages the job needs')
      expect(payload).not.toContain('Original brief')
    })

    it('includes a visual brief as explicit generate requirements', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Match this mock.',
        apiBindings: [],
        visualBrief: {
          screens: [
            {
              purpose: 'Lead form',
              visibleCopy: ['Company', 'Submit'],
              fields: [],
              ctas: ['Submit'],
              regions: [],
            },
          ],
          layout: { brandColor: '#1A73E8', density: 'compact' },
          catalogMapping: [],
          unrepresentable: [
            {
              observed: 'glass cards',
              reason: 'No glassmorphism in the catalog',
            },
          ],
        },
      })
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(payload).toContain('Visual brief from uploaded screenshot')
      expect(payload).toContain('Lead form')
      expect(mockAnalyzeIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          visualBrief: expect.objectContaining({
            layout: expect.objectContaining({ brandColor: '#1A73E8' }),
          }),
        })
      )
    })
  })

  describe('intent, planner, and spec', () => {
    const plannedBrief = {
      title: 'Orders',
      purpose: 'Browse orders and open one record.',
      audience: 'Ops',
      archetype: 'collection' as const,
      entryPath: 'home',
      pages: [
        {
          path: 'home',
          title: 'Orders',
          purpose: 'Collection',
          data: 'onLoad load_orders into orders',
          actions: ['load_orders'],
          emptyCopy: 'No orders yet.',
          archetype: 'collection' as const,
        },
        {
          path: 'detail',
          title: 'Order',
          purpose: 'Record',
          data: 'onLoad load_order from ?id',
          actions: ['load_order'],
          archetype: 'detail' as const,
        },
      ],
      actions: [],
    }

    const sampleIntent = {
      task: 'Browse orders and open one record.',
      audience: 'Ops coordinators',
      entities: [{ name: 'orders', kind: 'collection' as const }],
      dataRequirements: [{ apiKey: 'list_orders', usedFor: 'Fill the list' }],
      actions: [{ id: 'load_orders', apiKey: 'list_orders', purpose: 'Fetch the list' }],
      workflowComplexity: 'short' as const,
    }

    it('analyzes intent then plans a structured brief before asking for the manifest', async () => {
      mockAnalyzeIntent.mockResolvedValue({ intent: sampleIntent })
      mockPlanBrief.mockResolvedValue({ brief: plannedBrief })
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
      })

      expect(mockAnalyzeIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'Order inbox with a detail page.',
        })
      )
      expect(mockPlanBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'Order inbox with a detail page.',
          intent: sampleIntent,
        })
      )
      expect(mockAnalyzeIntent.mock.invocationCallOrder[0]).toBeLessThan(
        mockPlanBrief.mock.invocationCallOrder[0]
      )
      expect(mockPlanBrief.mock.invocationCallOrder[0]).toBeLessThan(
        mockCreateAnthropicMessage.mock.invocationCallOrder[0]
      )
    })

    it('skips analyzer and planner when editing an existing manifest', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Centre the search row.',
        apiBindings: [],
        existingManifest: twoPageManifest,
      })

      expect(mockAnalyzeIntent).not.toHaveBeenCalled()
      expect(mockPlanBrief).not.toHaveBeenCalled()
    })

    it('replans when Requested Changes explicitly asks to rebuild the app', async () => {
      const dashboardBrief = {
        ...plannedBrief,
        title: 'Operations',
        purpose: 'Weekly ops metrics on arrival.',
        archetype: 'dashboard' as const,
        pages: [
          {
            path: 'home',
            title: 'Operations',
            purpose: 'KPIs',
            data: 'onLoad load_dashboard into metrics',
            actions: ['load_dashboard'],
          },
        ],
      }
      mockPlanBrief.mockResolvedValue({ brief: dashboardBrief })
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Turn this into a dashboard of weekly ops metrics.',
        apiBindings: [],
        existingManifest: twoPageManifest,
        existingBrief: 'Lead qualifier. Home is a form.',
        existingStructuredBrief: plannedBrief,
      })

      expect(mockPlanBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: expect.stringContaining('Turn this into a dashboard'),
        })
      )
      expect(mockAnalyzeIntent).toHaveBeenCalled()
      expect(mockAnalyzeIntent.mock.invocationCallOrder[0]).toBeLessThan(
        mockPlanBrief.mock.invocationCallOrder[0]
      )
      const plannerInput = mockPlanBrief.mock.calls[0]?.[0].userInput as string
      expect(plannerInput).toContain('Re-plan request')
      expect(plannerInput).toContain('Lead qualifier')
      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(1)
      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(system).toContain('ARCHETYPE RECIPE: dashboard')
      expect(system).toContain('GOLD STANDARD REFERENCE LAYOUT (dashboard)')
      expect(system).not.toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
      expect(payload).toContain(REPLAN_GENERATE_INSTRUCTION)
      expect(payload).not.toContain(EDIT_PRESERVATION_INSTRUCTION)
      expect(payload).not.toContain('Existing manifest:')
      expect(payload).not.toContain('Original structured brief (context only')
      expect(payload).toContain('User request:')
      expect(payload).toContain('"archetype": "dashboard"')
    })

    it('reuses a stored structured brief on edit without pinning its sitemap', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Centre the search row.',
        apiBindings: [],
        existingManifest: twoPageManifest,
        existingStructuredBrief: plannedBrief,
      })

      expect(mockPlanBrief).not.toHaveBeenCalled()
      expect(mockAnalyzeIntent).not.toHaveBeenCalled()
      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(system).toContain('ARCHETYPE RECIPE: collection')
      expect(system).toContain('ARCHETYPE RECIPE: detail')
      expect(system).toContain(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL)
      expect(payload).toContain('Original structured brief (context only')
      expect(payload).toContain('"archetype": "collection"')
      expect(payload).not.toContain('emit exactly these page paths')
      expect(payload).not.toContain('Requested pages')
      expect(payload).not.toContain('Requested entryPath:')
    })

    it('selects the archetype recipe and contracts the sitemap to the brief', async () => {
      mockPlanBrief.mockResolvedValue({ brief: plannedBrief })
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [],
      })

      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(system).toContain('ARCHETYPE RECIPE: collection')
      expect(system).toContain('ARCHETYPE RECIPE: detail')
      expect(system).toContain(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL)
      expect(system).not.toContain('Watchtower')
      expect(system).not.toContain('GOLD STANDARD REFERENCE LAYOUT (task)')
      expect(payload).toContain('Structured brief')
      expect(payload).toContain('"archetype": "collection"')
      expect(payload).toContain('Requested pages')
      expect(payload).toContain('"path": "detail"')
      expect(payload).toContain('Requested entryPath: home')
      expect(payload).not.toContain('Infer a small coherent sitemap')
    })

    it('composes form-result with long-running and cancellable capabilities', async () => {
      mockPlanBrief.mockResolvedValue({
        brief: {
          title: 'Analyze',
          purpose: 'Run analysis and read the result.',
          audience: 'Analysts',
          archetype: 'task' as const,
          entryPath: 'home',
          pages: [
            {
              path: 'home',
              title: 'Analyze',
              purpose: 'Form',
              data: 'CTA then navigate',
              actions: ['run'],
            },
            {
              path: 'results',
              title: 'Result',
              purpose: 'Answer',
              data: 'CTA destination',
              actions: [],
              archetype: 'results' as const,
            },
          ],
          actions: [],
          processing: ['long-running', 'cancellable'],
        },
      })
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Analyze a company.',
        apiBindings: [{ key: 'run', label: 'Run', kind: 'workflow', workflowId: 'wf-1' }],
      })

      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      expect(system).toContain('ARCHETYPE RECIPE: task')
      expect(system).toContain('ARCHETYPE RECIPE: results')
      expect(system).toContain('CAPABILITY: LONG-RUNNING')
      expect(system).toContain('CAPABILITY: CANCELLABLE')
      expect(system).not.toContain('PROCESSING PATTERN')
    })

    it('uses the planned page count for the manifest output budget', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Two page app.',
        apiBindings: [],
      })
      const assumedBudget = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number

      vi.clearAllMocks()
      mockPlanBrief.mockResolvedValue({ brief: plannedBrief })
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))
      await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [],
      })
      const plannedBudget = mockCreateAnthropicMessage.mock.calls[0]?.[1].max_tokens as number

      expect(plannedBudget).toBeLessThan(assumedBudget)
    })

    it('still generates when planning returns nothing', async () => {
      mockPlanBrief.mockResolvedValue({
        brief: null,
        error: 'Planner reply was not a valid structured brief',
      })
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
      expect(result.content).toContain(
        'Planner failed (Planner reply was not a valid structured brief)'
      )
      expect(result.plannerError).toBe('Planner reply was not a valid structured brief')
      const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
      expect(system).not.toContain('ARCHETYPE RECIPE:')
    })

    it('surfaces the planned sitemap on a successful generate', async () => {
      mockAnalyzeIntent.mockResolvedValue({ intent: sampleIntent })
      mockPlanBrief.mockResolvedValue({
        brief: {
          ...plannedBrief,
          pages: [
            {
              path: 'home',
              title: 'Home',
              purpose: 'Form',
              data: 'CTA then navigate',
              actions: [],
            },
            {
              path: 'results',
              title: 'Results',
              purpose: 'Score',
              data: 'bind score',
              actions: [],
            },
          ],
        },
      })
      mockCreateAnthropicMessage.mockResolvedValue(
        textMessage(
          JSON.stringify({
            title: 'Orders',
            content: 'ok',
            manifest: { entryPath: 'home' },
            pages: twoPageManifest.pages,
            actions: twoPageManifest.actions,
          })
        )
      )

      const result = await generateArenaGenerativeManifest({
        userInput: 'Order inbox with a detail page.',
        apiBindings: [],
      })

      expect(result.success).toBe(true)
      expect(result.content).toContain('Intent: Browse orders and open one record.')
      expect(result.content).toContain('Planner: collection · home, results.')
      expect(result.structuredBrief).toEqual({
        title: 'Orders',
        archetype: 'collection',
        entryPath: 'home',
        pages: [
          { path: 'home', title: 'Home' },
          { path: 'results', title: 'Results' },
        ],
      })
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
          page: {
            type: 'Page',
            props: { title: 'Score', backgroundColor: null },
            children: ['tabs', 'section'],
          },
          tabs: {
            type: 'Tabs',
            props: {
              items: 'Home|home\nResults|results\nDashboard|dashboard\nSettings|settings',
              activePath: null,
            },
            children: [],
          },
          section: {
            type: 'Section',
            props: { padding: null, backgroundColor: null, maxWidth: null },
            children: ['stat'],
          },
          stat: {
            type: 'Stat',
            props: { label: 'Score', value: null, statePath: 'score' },
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
        userInput: 'Add a Back NavLink on every page.',
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
        userInput: 'Add a Back NavLink on every page.',
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

    it('skips scoping and preservation when Requested Changes asks to re-plan', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

      await generateArenaGenerativeManifest({
        userInput: 'Rebuild the app as a dashboard of weekly ops.',
        apiBindings: multiPageApiBindings,
        existingManifest: multiPageManifest,
        existingBrief: 'Lead qualifier with home and results.',
      })

      expect(mockPlanBrief).toHaveBeenCalled()
      expect(mockAnalyzeIntent).toHaveBeenCalled()
      const payload = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
      expect(payload).toContain(REPLAN_GENERATE_INSTRUCTION)
      expect(payload).not.toContain(SCOPED_EDIT_INSTRUCTION)
      expect(payload).not.toContain(EDIT_PRESERVATION_INSTRUCTION)
      expect(payload).not.toContain('Existing manifest:')
    })

    it('patches theme without calling the model', async () => {
      const result = await generateArenaGenerativeManifest({
        userInput: 'Set the theme to dark mode, density compact.',
        apiBindings: [],
        existingManifest: twoPageManifest,
        existingStructuredBrief: {
          title: 'Orders',
          purpose: 'Browse orders',
          audience: 'Ops',
          archetype: 'collection' as const,
          entryPath: 'home',
          pages: [
            {
              path: 'home',
              title: 'Orders',
              purpose: 'List',
              data: 'onLoad load_orders',
              actions: [],
            },
          ],
          actions: [],
        },
      })

      expect(mockCreateAnthropicMessage).not.toHaveBeenCalled()
      expect(mockPlanBrief).not.toHaveBeenCalled()
      expect(mockAnalyzeIntent).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.editScope).toEqual({ mode: 'theme', pages: [] })
      expect(result.content).toContain('Edit scope: theme only (pages unchanged).')
      expect(result.manifest?.theme?.colorScheme).toBe('dark')
      expect(result.manifest?.theme?.density).toBe('compact')
      expect(JSON.stringify(result.manifest?.pages)).toBe(JSON.stringify(twoPageManifest.pages))
    })
  })

  describe('UI critic', () => {
    const validReply = JSON.stringify({
      title: 'Lead qualifier',
      content: 'ok',
      manifest: twoPageManifest,
    })

    it('caps host-critic repair issues and names the remainder', () => {
      const issues = Array.from({ length: HOST_CRITIC_REPAIR_ISSUE_CAP + 2 }, (_, index) => {
        return `issue ${index + 1}`
      })
      const formatted = formatHostCriticRepairError(issues)
      expect(formatted).toContain('1. issue 1')
      expect(formatted).toContain(
        `${HOST_CRITIC_REPAIR_ISSUE_CAP}. issue ${HOST_CRITIC_REPAIR_ISSUE_CAP}`
      )
      expect(formatted).not.toContain(`${HOST_CRITIC_REPAIR_ISSUE_CAP + 1}. issue`)
      expect(formatted).toContain(
        `Showing the first ${HOST_CRITIC_REPAIR_ISSUE_CAP} of ${issues.length} issues.`
      )
    })

    function hostCriticExhaustionManifest() {
      const missingBack = manifestMissingResultsBack()
      const homeSpec = structuredClone(twoPageManifest.pages.home.spec)
      const homeElements = homeSpec.elements as Record<
        string,
        { type?: string; props?: Record<string, unknown>; children?: string[] }
      >
      const cardProps = {
        title: 'Group',
        subtitle: null,
        description: null,
        footerText: null,
        padding: null,
        variant: 'default',
        backgroundColor: null,
        showWhen: null,
      }
      homeElements.outer = { type: 'Card', props: cardProps, children: ['inner'] }
      homeElements.inner = {
        type: 'Card',
        props: { ...cardProps, title: 'Inner' },
        children: [],
      }
      const homeSection = homeElements.section
      if (homeSection) {
        homeSection.children = [...(homeSection.children ?? []), 'outer']
      }
      return {
        ...missingBack,
        pages: {
          ...missingBack.pages,
          home: { ...twoPageManifest.pages.home, spec: homeSpec },
        },
      }
    }

    function manifestMissingResultsBack() {
      const spec = structuredClone(twoPageResultsSpec)
      const section = spec.elements.section as { children: string[] }
      section.children = section.children.filter((id) => id !== 'back')
      const { back: _back, ...elements } = spec.elements
      return {
        ...twoPageManifest,
        pages: {
          ...twoPageManifest.pages,
          results: { ...twoPageManifest.pages.results, spec: { ...spec, elements } },
        },
      }
    }

    it('lists every remaining host-critic issue after repair turns are spent', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(
        textMessage(
          JSON.stringify({
            title: 'Lead qualifier',
            content: 'ok',
            manifest: hostCriticExhaustionManifest(),
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
      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS + 1)
      expect(result.error).toContain('Could not generate a valid app after 3 repair attempts.')
      expect(result.error).toContain('nested inside another Card')
      expect(result.error).toContain('onSuccess.navigate target')
      expect(result.error).toContain('What you can do:')
      expect(result.error).toContain('one primary action')
    })

    it('repairs a host-critic defect through the existing validation loop', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(
          textMessage(
            JSON.stringify({
              title: 'Lead qualifier',
              content: 'ok',
              manifest: manifestMissingResultsBack(),
            })
          )
        )
        .mockResolvedValueOnce(textMessage(validReply))

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
      expect(repairTurn.content).toContain('1. ')
      expect(repairTurn.content).toContain('Fix every numbered issue')
      expect(repairTurn.content).toContain('onSuccess.navigate target')
      expect(result.content).toContain('UI critic: passed')
    })

    it('sends every host-critic issue from the first spec in one repair turn', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(
          textMessage(
            JSON.stringify({
              title: 'Lead qualifier',
              content: 'ok',
              manifest: hostCriticExhaustionManifest(),
            })
          )
        )
        .mockResolvedValueOnce(textMessage(validReply))

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
      expect(repairTurn.content).toContain('1. ')
      expect(repairTurn.content).toContain('2. ')
      expect(repairTurn.content).toContain('nested inside another Card')
      expect(repairTurn.content).toContain('onSuccess.navigate target')
      expect(repairTurn.content).toContain('Fix every numbered issue')
      expect(result.content).toContain('UI critic: passed')
    })

    it('sends one extra spec turn when the LLM critic returns must-fix', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(textMessage(validReply))
        .mockResolvedValueOnce(textMessage(validReply))
      mockCritique.mockResolvedValue({
        pass: false,
        issues: [
          {
            category: 'ux',
            severity: 'must-fix',
            page: 'home',
            message: 'Primary task is buried.',
            fixHint: 'Add a PageHeader.',
          },
        ],
      })

      const result = await generateArenaGenerativeManifest({
        userInput: 'Lead qualifier.',
        apiBindings: [
          { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
        ],
      })

      expect(result.success).toBe(true)
      expect(mockCritique).toHaveBeenCalledTimes(1)
      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
      const repairTurn = mockCreateAnthropicMessage.mock.calls[1]?.[1].messages.at(-1) as {
        role: string
        content: string
      }
      expect(repairTurn.content).toContain('1. UI critic must-fix')
      expect(repairTurn.content).toContain('Primary task is buried')
      expect(repairTurn.content).toContain('Fix every numbered issue')
      expect(result.content).toContain('UI critic: repaired')
    })

    it('numbers every LLM critic must-fix in one repair turn', async () => {
      mockCreateAnthropicMessage
        .mockResolvedValueOnce(textMessage(validReply))
        .mockResolvedValueOnce(textMessage(validReply))
      mockCritique.mockResolvedValue({
        pass: false,
        issues: [
          {
            category: 'ux',
            severity: 'must-fix',
            page: 'home',
            message: 'Primary task is buried.',
            fixHint: 'Add a PageHeader.',
          },
          {
            category: 'visual',
            severity: 'must-fix',
            page: 'results',
            message: 'Hierarchy is flat.',
            fixHint: 'Promote the score.',
          },
          {
            category: 'ux',
            severity: 'should-fix',
            page: 'home',
            message: 'Subtitle is long.',
            fixHint: 'Shorten it.',
          },
        ],
      })

      const result = await generateArenaGenerativeManifest({
        userInput: 'Lead qualifier.',
        apiBindings: [
          { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
        ],
      })

      expect(result.success).toBe(true)
      expect(mockCritique).toHaveBeenCalledTimes(1)
      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
      const repairTurn = mockCreateAnthropicMessage.mock.calls[1]?.[1].messages.at(-1) as {
        role: string
        content: string
      }
      expect(repairTurn.content).toContain('1. UI critic must-fix (ux) on page "home"')
      expect(repairTurn.content).toContain('2. UI critic must-fix (visual) on page "results"')
      expect(repairTurn.content).not.toContain('Subtitle is long')
      expect(repairTurn.content).toContain('Fix every numbered issue')
      expect(result.content).toContain('UI critic: repaired')
    })

    it('still returns a valid manifest when the LLM critic throws', async () => {
      mockCreateAnthropicMessage.mockResolvedValue(textMessage(validReply))
      mockCritique.mockRejectedValue(new Error('haiku down'))

      const result = await generateArenaGenerativeManifest({
        userInput: 'Lead qualifier.',
        apiBindings: [
          { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.manifest?.pages.home).toBeTruthy()
      expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(1)
      expect(result.content).toContain('UI critic: skipped (unavailable)')
    })
  })
})
