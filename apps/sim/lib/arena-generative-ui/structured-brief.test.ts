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
  formatStructuredBriefForEdit,
  formatStructuredBriefForGenerator,
  pageHintsFromStructuredBrief,
  parseArenaGenerativeStructuredBrief,
  parseStoredStructuredBrief,
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
  capabilities: [],
  processing: [],
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
    expect(parsed?.processing).toEqual([])
    expect(parsed?.capabilities).toEqual([])
  })

  it('keeps a valid designIntent and aliases spacious to roomy', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        designIntent: {
          productType: 'crm',
          density: 'spacious',
          visualTone: 'professional',
          contentType: 'workflow',
          emphasis: 'discovery',
        },
      },
      { apiBindings: [] }
    )
    expect(parsed?.designIntent).toEqual({
      productType: 'crm',
      density: 'roomy',
      visualTone: 'professional',
      contentType: 'workflow',
      emphasis: 'discovery',
    })
  })

  it('drops unknown designIntent axes without failing the brief', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        designIntent: { productType: 'erp', density: 'compact', mood: 'loud' },
      },
      { apiBindings: [] }
    )
    expect(parsed?.archetype).toBe('list-detail')
    expect(parsed?.designIntent).toEqual({ density: 'compact' })
  })

  it('keeps a valid informationHierarchy and interactionModel', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        informationHierarchy: { dominant: 'collection', supporting: ['detail', 'filters'] },
        interactionModel: { navigation: 'list-detail', selection: 'navigate', wait: 'none' },
      },
      { apiBindings: [] }
    )
    expect(parsed?.informationHierarchy).toEqual({
      dominant: 'collection',
      supporting: ['detail', 'filters'],
    })
    expect(parsed?.interactionModel).toEqual({
      navigation: 'list-detail',
      selection: 'navigate',
      wait: 'none',
    })
  })

  it('drops unknown hierarchy dominant without failing the brief', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        informationHierarchy: { dominant: 'hero', supporting: ['sidebar'] },
        interactionModel: { navigation: 'portal', selection: 'same-page', wait: 'working_card' },
      },
      { apiBindings: [] }
    )
    expect(parsed?.archetype).toBe('list-detail')
    expect(parsed?.informationHierarchy).toEqual({ supporting: ['sidebar'] })
    expect(parsed?.interactionModel).toEqual({ selection: 'same-page', wait: 'working-card' })
  })

  it('accepts snake_case hierarchy and interaction keys', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        information_hierarchy: { dominant: 'wizard_step', supporting: ['history'] },
        interaction_model: { navigation: 'search_hero', selection: 'same_page', wait: 'none' },
      },
      { apiBindings: [] }
    )
    expect(parsed?.informationHierarchy).toEqual({
      dominant: 'wizard-step',
      supporting: ['history'],
    })
    expect(parsed?.interactionModel).toEqual({
      navigation: 'search-hero',
      selection: 'same-page',
      wait: 'none',
    })
  })

  it('keeps form-result processing tags, folds them into capabilities, and drops unknown ones', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Search',
        purpose: 'Find a company.',
        audience: 'Analysts',
        archetype: 'form-result',
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Search',
            purpose: 'Query',
            data: 'CTA then navigate',
            actions: ['search'],
          },
        ],
        actions: [],
        processing: ['long-running', 'cancellable', 'nope'],
      },
      { apiBindings: [] }
    )
    expect(parsed?.processing).toEqual(['long-running', 'cancellable'])
    expect(parsed?.capabilities).toEqual(['long-running', 'cancellable'])
  })

  it('strips LLM-emitted intent so only the analyzer result is nested later', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        intent: {
          task: 'Invented',
          audience: 'Users',
          entities: [],
          dataRequirements: [],
          actions: [],
          workflowComplexity: 'short',
        },
      },
      { apiBindings: [] }
    )
    expect(parsed?.intent).toBeUndefined()
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
    expect(archetypeRecipe('form-result')).toContain('form → processing → result')
    expect(archetypeRecipe('form-result')).toContain('SearchField')
    expect(archetypeRecipe('form-result')).toContain('CAPABILITY')
    expect(archetypeRecipe('form-result')).toContain('inputs.targetKeyword')
    expect(archetypeRecipe('form-result')).toContain('{targetKeyword}')
    expect(archetypeRecipe('form-result')).toContain('never "field.content"')
    expect(archetypeRecipe('form-result')).toContain('Results has no onLoad')
    expect(archetypeRecipe('form-result')).not.toContain('WorkingCard')
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
    expect(formatted).toContain('senior engineer would not skip')
  })

  it('serialises the stored brief as edit context without pinning the sitemap', () => {
    const formatted = formatStructuredBriefForEdit(listDetailBrief)
    expect(formatted).toContain('Original structured brief (context only')
    expect(formatted).toContain('"archetype": "list-detail"')
    expect(formatted).not.toContain('emit exactly these page paths')
  })

  it('accepts a stored structured brief and maps legacy processing onto capabilities', () => {
    expect(parseStoredStructuredBrief(listDetailBrief)?.archetype).toBe('list-detail')
    expect(parseStoredStructuredBrief({ title: 'nope' })).toBeNull()
    expect(parseStoredStructuredBrief(null)).toBeNull()
    const stored = parseStoredStructuredBrief({
      ...listDetailBrief,
      processing: ['long-running', 'cancellable'],
      intent: {
        task: 'Browse orders',
        audience: 'Ops coordinators',
        entities: [{ name: 'orders', kind: 'collection' }],
        dataRequirements: [],
        actions: [],
        workflowComplexity: 'short',
      },
    })
    expect(stored?.capabilities).toEqual(['long-running', 'cancellable'])
    expect(stored?.intent?.task).toBe('Browse orders')
  })

  it('keeps stored designIntent', () => {
    const stored = parseStoredStructuredBrief({
      ...listDetailBrief,
      designIntent: { productType: 'finance', density: 'spacious' },
    })
    expect(stored?.designIntent).toEqual({ productType: 'finance', density: 'roomy' })
  })

  it('keeps stored informationHierarchy and interactionModel', () => {
    const stored = parseStoredStructuredBrief({
      ...listDetailBrief,
      informationHierarchy: { dominant: 'metrics', supporting: ['stats'] },
      interactionModel: { navigation: 'tabs', selection: 'none', wait: 'none' },
    })
    expect(stored?.informationHierarchy).toEqual({ dominant: 'metrics', supporting: ['stats'] })
    expect(stored?.interactionModel).toEqual({
      navigation: 'tabs',
      selection: 'none',
      wait: 'none',
    })
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
    expect(system).toContain('Plan sitemap, data, actions, and capabilities')
    expect(system).toContain('the host compiles those')
    expect(system).toContain('When Analyzed intent is present')
    expect(system).toContain('primary verb')
    expect(system).toContain('never "users"')
    expect(system).toContain('Bindings are the data contract')
    expect(system).toContain('must not onLoad that same action')
    expect(system).toContain('form → processing → result')
    expect(system).toContain('Set capabilities to the tags that apply')
    expect(system).toContain('Also emit designIntent')
    expect(system).toContain('spacious means roomy')
    expect(system).toContain('informationHierarchy')
    expect(system).toContain('interactionModel')
    expect(system).toContain('Surfaces are exactly two')
    expect(system).toContain('do not emit hex, fonts, CSS, catalog component types')
    expect(system).not.toContain('nested ProgressSteps')
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('Do not emit page specs')
    expect(userMessage).toContain('No analyzed intent')
    expect(userMessage).toContain('Order inbox with a detail page.')
  })

  it('passes analyzed intent JSON to the planner payload', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(listDetailBrief)))
    const intent = {
      task: 'Browse orders and open one record.',
      audience: 'Ops coordinators',
      entities: [{ name: 'orders' as const, kind: 'collection' as const }],
      dataRequirements: [{ apiKey: 'list_orders', usedFor: 'Fill the list' }],
      actions: [{ id: 'load_orders', apiKey: 'list_orders', purpose: 'Fetch the list' }],
      workflowComplexity: 'short' as const,
    }

    const planned = await planArenaGenerativeStructuredBrief({
      userInput: 'Order inbox with a detail page.',
      apiBindings: [
        { key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' },
        { key: 'get_order', label: 'Get', kind: 'workflow', workflowId: 'wf-2' },
      ],
      intent,
    })

    expect(planned.brief?.intent).toEqual(intent)
    const userMessage = mockCreateAnthropicMessage.mock.calls[0]?.[1].messages[0].content as string
    expect(userMessage).toContain('Analyzed intent')
    expect(userMessage).toContain('"task":"Browse orders and open one record."')
    expect(userMessage).not.toContain('No analyzed intent')
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
