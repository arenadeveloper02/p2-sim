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
  ARENA_GENERATIVE_ARCHETYPES,
  type ArenaGenerativeStructuredBrief,
  archetypeRecipe,
  formatStructuredBriefForGenerator,
  pageHintsFromStructuredBrief,
  parseArenaGenerativeStructuredBrief,
  planArenaGenerativeStructuredBrief,
} from '@/lib/arena-generative-ui/structured-brief'

const listDetailBrief: ArenaGenerativeStructuredBrief = {
  title: 'Orders',
  purpose: 'Browse orders and open one record.',
  audience: 'Ops coordinators',
  archetype: 'list-detail',
  entryPath: 'home',
  pages: [
    {
      path: 'home',
      title: 'Orders',
      purpose: 'Collection of open orders',
      data: 'onLoad load_orders into orders',
      actions: ['load_orders'],
      emptyCopy: 'No orders yet.',
    },
    {
      path: 'detail',
      title: 'Order',
      purpose: 'One order',
      data: 'onLoad load_order into the record from ?id',
      actions: ['load_order'],
    },
  ],
  actions: [
    {
      id: 'load_orders',
      apiKey: 'list_orders',
      fromPage: 'home',
      purpose: 'Fetch the list',
      onSuccessNavigate: null,
    },
    {
      id: 'load_order',
      apiKey: 'get_order',
      fromPage: 'detail',
      purpose: 'Fetch one record',
      onSuccessNavigate: null,
    },
  ],
  emptyCopy: 'No orders yet.',
}

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

describe('parseArenaGenerativeStructuredBrief', () => {
  it('accepts a valid list-detail brief', () => {
    const parsed = parseArenaGenerativeStructuredBrief(listDetailBrief, {
      apiBindings: [
        { key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' },
        { key: 'get_order', label: 'Get', kind: 'workflow', workflowId: 'wf-2' },
      ],
    })
    expect(parsed?.archetype).toBe('list-detail')
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home', 'detail'])
  })

  it('returns null for a manifest-shaped payload', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      { title: 'App', manifest: { entryPath: 'home', pages: { home: {} } } },
      { apiBindings: [] }
    )
    expect(parsed).toBeNull()
  })

  it('drops actions whose apiKey is not a declared binding', () => {
    const parsed = parseArenaGenerativeStructuredBrief(listDetailBrief, {
      apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }],
    })
    expect(parsed?.actions.map((action) => action.apiKey)).toEqual(['list_orders'])
  })

  it('clears actions when no bindings were declared', () => {
    const parsed = parseArenaGenerativeStructuredBrief(listDetailBrief, { apiBindings: [] })
    expect(parsed?.actions).toEqual([])
  })

  /**
   * The shape a planner actually returns for a brief written in web-route
   * language: every path is a URL, and root has no kebab-case spelling at all.
   */
  it('normalises URL-style paths from a planner that thinks in routes', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        entryPath: '/',
        pages: [
          { ...listDetailBrief.pages[0], path: '/' },
          { ...listDetailBrief.pages[1], path: '/select-company' },
        ],
        actions: [
          { ...listDetailBrief.actions[0], fromPage: '/' },
          {
            ...listDetailBrief.actions[1],
            fromPage: '/select-company',
            onSuccessNavigate: '/report?range=30d',
          },
        ],
      },
      {
        apiBindings: [
          { key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' },
          { key: 'get_order', label: 'Get', kind: 'workflow', workflowId: 'wf-2' },
        ],
      }
    )
    expect(parsed?.entryPath).toBe('home')
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home', 'select-company'])
    expect(parsed?.actions.map((action) => action.fromPage)).toEqual(['home', 'select-company'])
    expect(parsed?.actions[1]?.onSuccessNavigate).toBe('report?range=30d')
  })

  it('folds a nested or spaced path into one kebab-case key', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        entryPath: '/company/analysis',
        pages: [
          { ...listDetailBrief.pages[0], path: '/company/analysis' },
          { ...listDetailBrief.pages[1], path: 'Select Company' },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.pages.map((page) => page.path)).toEqual(['company-analysis', 'select-company'])
    expect(parsed?.entryPath).toBe('company-analysis')
  })

  it('leaves a blank navigation target blank rather than pointing it at root', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        actions: [{ ...listDetailBrief.actions[0], onSuccessNavigate: '' }],
      },
      { apiBindings: [{ key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' }] }
    )
    expect(parsed?.actions[0]?.onSuccessNavigate).toBe('')
  })

  it('keeps exactly the pinned page paths and fills gaps', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      { ...listDetailBrief, pages: [listDetailBrief.pages[0]] },
      {
        apiBindings: [],
        pageHints: [
          { path: 'home', title: 'Inbox', purpose: 'Pinned list' },
          { path: 'person', title: 'Person' },
        ],
        entryPath: 'home',
      }
    )
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home', 'person'])
    expect(parsed?.pages[0]?.title).toBe('Inbox')
    expect(parsed?.pages[0]?.purpose).toBe('Pinned list')
    expect(parsed?.pages[1]?.data).toBe('static')
    expect(parsed?.entryPath).toBe('home')
  })
})

describe('structured brief helpers', () => {
  it('exposes a recipe for every archetype without the old one-card wording', () => {
    for (const archetype of ARENA_GENERATIVE_ARCHETYPES) {
      const recipe = archetypeRecipe(archetype)
      expect(recipe).toContain(`ARCHETYPE RECIPE: ${archetype}`)
      expect(recipe).not.toContain('one Card')
    }
    expect(archetypeRecipe('form-result')).toContain('SearchField')
    expect(archetypeRecipe('form-result')).toContain('not ProgressSteps')
    expect(archetypeRecipe('form-result')).toContain('destination page')
    expect(archetypeRecipe('form-result')).toContain('inputs.*')
    expect(archetypeRecipe('form-result')).not.toContain('nested ProgressSteps')
    expect(archetypeRecipe('list-detail')).toContain('entity Cards')
    expect(archetypeRecipe('list-detail')).toContain('selectItem')
    expect(archetypeRecipe('list-detail')).toContain('clearItem')
    expect(archetypeRecipe('list-detail')).toContain('!selectedId')
    expect(archetypeRecipe('dashboard')).toContain('EntityHeader')
    expect(archetypeRecipe('dashboard')).toContain('display')
    expect(archetypeRecipe('dashboard')).toContain('Sparkline')
  })

  it('turns planned pages into generator page hints', () => {
    expect(pageHintsFromStructuredBrief(listDetailBrief)).toEqual([
      { path: 'home', title: 'Orders', purpose: 'Collection of open orders' },
      { path: 'detail', title: 'Order', purpose: 'One order' },
    ])
  })

  it('serialises the brief as the generator contract', () => {
    const formatted = formatStructuredBriefForGenerator(listDetailBrief)
    expect(formatted).toContain('Structured brief')
    expect(formatted).toContain('"archetype": "list-detail"')
    expect(formatted).toContain('emptyCopy as emptyText')
  })
})

describe('planArenaGenerativeStructuredBrief', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the planned brief from a JSON reply', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(listDetailBrief)))

    const planned = await planArenaGenerativeStructuredBrief({
      userInput: 'Order inbox with a detail page.',
      apiBindings: [
        { key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' },
        { key: 'get_order', label: 'Get', kind: 'workflow', workflowId: 'wf-2' },
      ],
    })

    expect(planned.brief?.archetype).toBe('list-detail')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 4_096,
        system: expect.stringContaining('Pick exactly one archetype'),
      })
    )
    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('Plan sitemap, data, and actions')
    expect(system).toContain('the host compiles those')
    expect(system).not.toContain('nested ProgressSteps')
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('Do not emit page specs')
    expect(userMessage).toContain('Order inbox with a detail page.')
  })

  it('retries once when the first reply is not a brief', async () => {
    mockCreateAnthropicMessage
      .mockResolvedValueOnce(textMessage('{"title":"Nope"}'))
      .mockResolvedValueOnce(textMessage(JSON.stringify(listDetailBrief)))

    const planned = await planArenaGenerativeStructuredBrief({
      userInput: 'Order inbox.',
      apiBindings: [],
    })

    expect(planned.brief?.title).toBe('Orders')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
    const repair = mockCreateAnthropicMessage.mock.calls[1]?.[1].messages.at(-1) as {
      content: string
    }
    expect(repair.content).toContain('not a valid structured brief')
  })

  it('returns a planner error rather than throwing when every reply is unusable', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('not json'))

    const planned = await planArenaGenerativeStructuredBrief({
      userInput: 'Team directory.',
      apiBindings: [],
    })

    expect(planned).toEqual({
      brief: null,
      error: 'Planner reply was not a valid structured brief',
    })
    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
  })

  it('asks the planner to honour a pinned sitemap', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(listDetailBrief)))

    await planArenaGenerativeStructuredBrief({
      userInput: 'Team directory.',
      pages: [{ path: 'home', title: 'People' }],
      entryPath: 'home',
      apiBindings: [],
    })

    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('use exactly these paths')
    expect(userMessage).toContain('"path": "home"')
    expect(userMessage).toContain('Requested entryPath: home')
  })
})
