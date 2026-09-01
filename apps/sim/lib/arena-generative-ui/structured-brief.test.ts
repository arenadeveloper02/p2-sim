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

import { PLANNER_CONTRACT_PROMPT } from '@/lib/arena-generative-ui/planner-contract'
import { buildGeneratorSystemPrompt, generatorPromptOptionsFromBrief } from '@/lib/arena-generative-ui/prompt-pipeline'
import {
  ARENA_GENERATIVE_ARCHETYPES,
  type ArenaGenerativeStructuredBrief,
  archetypeRecipe,
  archetypeRecipesForBrief,
  formatPageShapesForGenerator,
  formatStructuredBriefForEdit,
  formatStructuredBriefForGenerator,
  pageHintsFromStructuredBrief,
  parseArenaGenerativeStructuredBrief,
  parseStoredStructuredBrief,
  planArenaGenerativeStructuredBrief,
  recipesForBlueprint,
} from '@/lib/arena-generative-ui/structured-brief'

const listDetailBrief: ArenaGenerativeStructuredBrief = {
  title: 'Orders',
  purpose: 'Browse orders and open one record.',
  audience: 'Ops coordinators',
  archetype: 'collection',
  entryPath: 'home',
  pages: [
    {
      path: 'home',
      title: 'Orders',
      purpose: 'Collection of open orders',
      data: 'onLoad load_orders into orders',
      actions: ['load_orders'],
      emptyCopy: 'No orders yet.',
      archetype: 'collection',
      capabilities: [],
    },
    {
      path: 'detail',
      title: 'Order',
      purpose: 'One order',
      data: 'onLoad load_order into the record from ?id',
      actions: ['load_order'],
      archetype: 'detail',
      capabilities: [],
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
  it('aliases a stored list-detail brief onto collection + detail pages', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        archetype: 'list-detail',
        pages: listDetailBrief.pages.map(({ archetype: _shape, ...page }) => page),
      },
      {
      apiBindings: [
        { key: 'list_orders', label: 'List', kind: 'workflow', workflowId: 'wf-1' },
        { key: 'get_order', label: 'Get', kind: 'workflow', workflowId: 'wf-2' },
      ],
    })
    expect(parsed?.archetype).toBe('collection')
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home', 'detail'])
    expect(parsed?.pages.map((page) => page.archetype)).toEqual(['collection', 'detail'])
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
      tone: 'professional',
      contentType: 'workflow',
      emphasis: 'discovery',
      visualPriority: 'discovery',
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
    expect(parsed?.archetype).toBe('collection')
    expect(parsed?.designIntent).toEqual({ density: 'compact' })
  })

  it('does not set shell from interactionModel.navigation workspace', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        interactionModel: { navigation: 'workspace', selection: 'same-page', wait: 'none' },
      },
      { apiBindings: [] }
    )
    expect(parsed?.shell).toBeUndefined()
    expect(parsed?.interactionModel?.navigation).toBe('workspace')
    expect(parsed?.archetype).toBe('collection')
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
    expect(parsed?.archetype).toBe('collection')
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
    expect(parsed?.archetype).toBe('task')
    expect(parsed?.pages[0]?.archetype).toBe('task')
    expect(parsed?.processing).toEqual(['long-running', 'cancellable'])
    expect(parsed?.capabilities).toEqual(['long-running', 'cancellable'])
  })

  it('aliases wizard onto workflow pages', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Onboard',
        purpose: 'Walk through setup.',
        audience: 'Admins',
        archetype: 'wizard',
        entryPath: 'home',
        pages: [
          { path: 'home', title: 'Setup', purpose: 'Steps', data: 'static', actions: [] },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.archetype).toBe('workflow')
    expect(parsed?.pages[0]?.archetype).toBe('workflow')
  })

  it('keeps workspace pages and regions instead of folding them away', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Projects',
        purpose: 'See tasks alongside the project list.',
        audience: 'Leads',
        complexity: 'moderate',
        archetype: 'workspace',
        shell: { navigation: 'sidebar' },
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Projects',
            purpose: 'Navigator, tasks, and inspector together',
            data: { mode: 'dummy' },
            actions: [],
            archetype: 'workspace',
            regions: {
              navigator: {
                archetype: 'collection',
                representation: 'list',
                entity: 'project',
                purpose: 'Project list',
              },
              primary: {
                archetype: 'collection',
                representation: 'list',
                entity: 'task',
                purpose: 'Tasks in the selected project',
              },
              inspector: { archetype: 'detail', entity: 'task', purpose: 'Selected task' },
            },
          },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.archetype).toBe('workspace')
    expect(parsed?.shell).toEqual({ navigation: 'sidebar' })
    expect(parsed?.pages[0]?.archetype).toBe('workspace')
    expect(parsed?.pages[0]?.regions?.navigator?.archetype).toBe('collection')
    expect(parsed?.pages[0]?.regions?.primary?.archetype).toBe('collection')
    expect(parsed?.pages[0]?.regions?.inspector?.archetype).toBe('detail')
    expect(parsed?.pages[0]?.dataMode).toBe('dummy')
  })

  it('drops a prose interaction string instead of failing the brief', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Todos',
        purpose: 'Track tasks.',
        audience: 'Anyone',
        complexity: 'micro',
        archetype: 'collection',
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Todos',
            purpose: 'List',
            data: { mode: 'dummy' },
            actions: [],
            interaction: 'create and complete on the list',
          },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.pages[0]?.interaction).toBeUndefined()
    expect(parsed?.complexity).toBe('micro')
  })

  it('clamps an oversized page actions list instead of rejecting the brief', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'CRM',
        purpose: 'Customers',
        audience: 'Reps',
        complexity: 'moderate',
        archetype: 'collection',
        entryPath: 'customers',
        pages: [
          {
            path: 'customers',
            title: 'Customers',
            purpose: 'Table',
            data: { mode: 'dummy' },
            actions: Array.from({ length: 20 }, (_, index) => `action-${index + 1}`),
          },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.pages[0]?.actions).toHaveLength(16)
  })

  it('keeps entity, representation, modules, and a declared sidebar shell', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        entity: 'order',
        representation: 'table',
        shell: { navigation: 'sidebar', header: true, breadcrumbs: true },
        pages: [
          {
            ...listDetailBrief.pages[0],
            representation: 'cards',
            modules: ['activity', 'ai-analysis', 'Activity', '???'],
          },
          listDetailBrief.pages[1],
        ],
      },
      { apiBindings: [] }
    )
    expect(parsed?.entity).toBe('order')
    expect(parsed?.representation).toBe('table')
    expect(parsed?.shell).toEqual({
      navigation: 'sidebar',
      header: true,
      breadcrumbs: true,
    })
    expect(parsed?.pages[0]?.representation).toBe('cards')
    expect(parsed?.pages[0]?.modules).toEqual(['activity', 'ai-analysis'])
  })

  it('fails an unknown representation open to auto, drops unknown shell, and maps secondary role to a module', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        ...listDetailBrief,
        representation: 'kanban_board',
        shell: { navigation: 'drawer', header: 'yes' },
        pages: [
          {
            ...listDetailBrief.pages[0],
            representation: 'nope',
            secondary: { role: 'detail', archetype: 'detail' },
          },
          listDetailBrief.pages[1],
        ],
      },
      { apiBindings: [] }
    )
    expect(parsed?.representation).toBe('auto')
    expect(parsed?.shell).toBeUndefined()
    expect(parsed?.pages[0]?.representation).toBe('auto')
    expect(parsed?.pages[0]?.modules).toEqual(['detail'])
    expect(parsed?.pages[0]?.secondary).toBeUndefined()
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
    expect(archetypeRecipe('task')).toContain('SearchField')
    expect(archetypeRecipe('task')).toContain('Do not add a results or history page unless')
    expect(archetypeRecipe('results')).toContain('DataText "content"')
    expect(archetypeRecipe('results')).toContain('No onLoad of the CTA')
    expect(archetypeRecipe('results')).toContain('Do not invent SWOT')
    expect(archetypeRecipe('collection')).toContain('pages[].representation')
    expect(archetypeRecipe('collection')).toContain('CAPABILITY inspect')
    expect(archetypeRecipe('collection')).not.toContain('Table when every row')
    expect(archetypeRecipe('detail')).toContain('Understand one entity')
    expect(archetypeRecipe('dashboard')).toContain('Module count')
    expect(archetypeRecipe('dashboard')).not.toContain('Grid of four Stat size display')
    expect(archetypeRecipe('workflow')).toContain('Stepper')
    expect(archetypeRecipe('workflow')).not.toContain('One page per step')
    expect(archetypeRecipe('content')).toContain('DataText markdown')
    expect(archetypeRecipe('workspace')).toContain('Honour pages[].regions')
    expect(ARENA_GENERATIVE_ARCHETYPES).toContain('workspace')
  })

  it('composes recipes and page-shape lines for mixed sitemaps', () => {
    const recipes = archetypeRecipesForBrief(listDetailBrief)
    expect(recipes).toContain('ARCHETYPE RECIPE: collection')
    expect(recipes).toContain('ARCHETYPE RECIPE: detail')
    expect(recipes).not.toContain('ARCHETYPE RECIPE: workspace')
    expect(recipes).not.toContain('SHELL RECIPE')
    expect(formatPageShapesForGenerator(listDetailBrief)).toContain('home: collection representation=auto')
    expect(formatPageShapesForGenerator(listDetailBrief)).toContain('detail: detail representation=auto')
    expect(formatPageShapesForGenerator(listDetailBrief)).toContain('Shell: navigation=minimal')
    expect(formatPageShapesForGenerator(listDetailBrief)).toContain(
      'one primary archetype + capabilities + optional regions'
    )
  })

  it('appends the shell recipe and modules line when chrome is a sidebar', () => {
    const brief: ArenaGenerativeStructuredBrief = {
      ...listDetailBrief,
      shell: { navigation: 'sidebar' },
      pages: [
        { ...listDetailBrief.pages[0], modules: ['navigator', 'activity'] },
        listDetailBrief.pages[1],
      ],
    }
    const recipes = archetypeRecipesForBrief(brief)
    expect(recipes).toContain('SHELL RECIPE')
    expect(recipes).toContain('catalog Workspace')
    expect(formatPageShapesForGenerator(brief)).toContain('Shell: navigation=sidebar')
    expect(formatPageShapesForGenerator(brief)).toContain('modules: navigator, activity')
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
    expect(formatted).toContain('"archetype": "collection"')
    expect(formatted).toContain('emptyCopy as emptyText')
    expect(formatted).toContain('Do not add pages, history, stats, or modules')
  })

  it('serialises the stored brief as edit context without pinning the sitemap', () => {
    const formatted = formatStructuredBriefForEdit(listDetailBrief)
    expect(formatted).toContain('Original structured brief (context only')
    expect(formatted).toContain('"archetype": "collection"')
    expect(formatted).not.toContain('emit exactly these page paths')
  })

  it('accepts a stored structured brief and maps legacy processing onto capabilities', () => {
    expect(parseStoredStructuredBrief(listDetailBrief)?.archetype).toBe('collection')
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
    expect(stored?.designIntent).toEqual({
      productType: 'finance',
      density: 'roomy',
    })
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

    expect(planned.brief?.archetype).toBe('collection')
    expect(mockCreateAnthropicMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 4_096,
        system: PLANNER_CONTRACT_PROMPT,
      })
    )
    const system = mockCreateAnthropicMessage.mock.calls[0]?.[1].system as string
    expect(system).toContain('SCOPE BUDGET')
    expect(system).toContain('source dummy or local')
    expect(system).toContain('WORKSPACE REGIONS')
    expect(system).toContain('Do not add dashboards, statistics, history')
    expect(system).toContain('/add-customer is not automatically required')
    expect(system).toContain('When Analyzed intent is present')
    expect(system).not.toContain('workspace is not a page archetype')
    expect(system).not.toContain('actions must be []')
    expect(system).not.toContain('Pick exactly one app-level archetype')
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
    expect(userMessage).toContain('actions are still required for requested mutations')
  })
})

describe('target blueprint fixtures', () => {
  it('parses the micro todo blueprint and selects collection plus dummy recipes', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Todos',
        purpose: 'Track a personal task list.',
        audience: 'Anyone keeping a short list',
        complexity: 'micro',
        archetype: 'collection',
        shell: { navigation: 'minimal' },
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Todos',
            purpose: 'List and complete todos',
            archetype: 'collection',
            representation: 'list',
            capabilities: ['create', 'complete'],
            data: { mode: 'dummy' },
            actions: ['add_todo', 'complete_todo'],
          },
        ],
        actions: [
          { id: 'add_todo', purpose: 'Create a todo', source: 'dummy' },
          { id: 'complete_todo', purpose: 'Toggle done', source: 'dummy' },
        ],
      },
      { apiBindings: [] }
    )
    expect(parsed?.complexity).toBe('micro')
    expect(parsed?.shell?.navigation).toBe('minimal')
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home'])
    expect(parsed?.pages[0]?.archetype).toBe('collection')
    expect(parsed?.pages[0]?.capabilities).toEqual(['create', 'complete'])
    expect(parsed?.pages[0]?.dataMode).toBe('dummy')
    expect(parsed?.actions.map((action) => action.id)).toEqual(['add_todo', 'complete_todo'])
    const recipes = recipesForBlueprint(parsed!)
    expect(recipes).toContain('ARCHETYPE RECIPE: collection')
    expect(recipes).toContain('DUMMY / LOCAL DATA')
    expect(recipes).not.toContain('ARCHETYPE RECIPE: detail')
    expect(recipes).not.toContain('ARCHETYPE RECIPE: dashboard')
    expect(recipes).not.toContain('SHELL RECIPE')
    const prompt = buildGeneratorSystemPrompt({
      ...generatorPromptOptionsFromBrief(parsed, {
        hasBindings: false,
        hasStreamingBinding: false,
      }),
      capabilities: parsed!.capabilities,
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (dashboard)')
    expect(prompt).not.toContain('SWOT')
    expect(prompt).not.toContain('productType')
  })

  it('parses the CRM blueprint without an add-customer page', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'CRM',
        purpose: 'Manage customers, contacts, and opportunities.',
        audience: 'Sales reps',
        complexity: 'moderate',
        archetype: 'collection',
        shell: { navigation: 'sidebar' },
        entryPath: 'customers',
        pages: [
          {
            path: 'customers',
            title: 'Customers',
            purpose: 'Customer table',
            archetype: 'collection',
            representation: 'table',
            data: { mode: 'dummy' },
            actions: [],
          },
          {
            path: 'customer-detail',
            title: 'Customer',
            purpose: 'One customer',
            archetype: 'detail',
            data: { mode: 'dummy' },
            actions: [],
          },
          {
            path: 'contacts',
            title: 'Contacts',
            purpose: 'Contact table',
            archetype: 'collection',
            representation: 'table',
            data: { mode: 'dummy' },
            actions: [],
          },
          {
            path: 'opportunities',
            title: 'Opportunities',
            purpose: 'Opportunity table',
            archetype: 'collection',
            representation: 'table',
            data: { mode: 'dummy' },
            actions: [],
          },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.complexity).toBe('moderate')
    expect(parsed?.shell?.navigation).toBe('sidebar')
    expect(parsed?.pages.map((page) => page.path)).toEqual([
      'customers',
      'customer-detail',
      'contacts',
      'opportunities',
    ])
    expect(parsed?.pages.some((page) => page.path === 'add-customer')).toBe(false)
    const recipes = recipesForBlueprint(parsed!)
    expect(recipes).toContain('ARCHETYPE RECIPE: collection')
    expect(recipes).toContain('ARCHETYPE RECIPE: detail')
    expect(recipes).toContain('SHELL RECIPE')
  })

  it('parses competitor analysis as task plus results with no history page', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Competitor analysis',
        purpose: 'Enter a company and receive a report.',
        audience: 'Analysts',
        complexity: 'moderate',
        archetype: 'task',
        shell: { navigation: 'minimal' },
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Analyze',
            purpose: 'Company input',
            archetype: 'task',
            capabilities: ['analyze'],
            data: { mode: 'dummy' },
            actions: ['analyze-company'],
          },
          {
            path: 'report',
            title: 'Report',
            purpose: 'Generated analysis',
            archetype: 'results',
            data: { mode: 'dummy' },
            actions: [],
          },
        ],
        actions: [
          {
            id: 'analyze-company',
            purpose: 'Run the analysis',
            source: 'dummy',
            target: 'report',
          },
        ],
      },
      { apiBindings: [] }
    )
    expect(parsed?.complexity).toBe('moderate')
    expect(parsed?.shell?.navigation).toBe('minimal')
    expect(parsed?.pages.map((page) => page.path)).toEqual(['home', 'report'])
    expect(parsed?.pages.some((page) => page.path === 'history')).toBe(false)
    expect(parsed?.actions.map((action) => action.id)).toEqual(['analyze-company'])
    const recipes = recipesForBlueprint(parsed!)
    expect(recipes).toContain('ARCHETYPE RECIPE: task')
    expect(recipes).toContain('ARCHETYPE RECIPE: results')
    expect(recipes).not.toContain('ARCHETYPE RECIPE: dashboard')
    expect(recipes).not.toContain('SHELL RECIPE')
  })

  it('parses project management as one workspace page with three regions', () => {
    const parsed = parseArenaGenerativeStructuredBrief(
      {
        title: 'Projects',
        purpose: 'See task details alongside the task list.',
        audience: 'Project leads',
        complexity: 'moderate',
        archetype: 'workspace',
        shell: { navigation: 'sidebar' },
        entryPath: 'home',
        pages: [
          {
            path: 'home',
            title: 'Workspace',
            purpose: 'Projects, tasks, and inspector',
            archetype: 'workspace',
            capabilities: ['select', 'inspect'],
            data: { mode: 'dummy' },
            regions: {
              navigator: {
                archetype: 'collection',
                representation: 'list',
                entity: 'project',
              },
              primary: { archetype: 'collection', representation: 'list', entity: 'task' },
              inspector: { archetype: 'detail', entity: 'task' },
            },
          },
        ],
        actions: [],
      },
      { apiBindings: [] }
    )
    expect(parsed?.complexity).toBe('moderate')
    expect(parsed?.shell?.navigation).toBe('sidebar')
    expect(parsed?.pages).toHaveLength(1)
    expect(parsed?.pages[0]?.archetype).toBe('workspace')
    expect(parsed?.pages[0]?.regions?.navigator?.entity).toBe('project')
    expect(parsed?.pages[0]?.regions?.primary?.entity).toBe('task')
    expect(parsed?.pages[0]?.regions?.inspector?.archetype).toBe('detail')
    const recipes = recipesForBlueprint(parsed!)
    expect(recipes).toContain('ARCHETYPE RECIPE: workspace')
    expect(recipes).toContain('ARCHETYPE RECIPE: collection')
    expect(recipes).toContain('ARCHETYPE RECIPE: detail')
    expect(recipes).toContain('SHELL RECIPE')
    const prompt = buildGeneratorSystemPrompt({
      ...generatorPromptOptionsFromBrief(parsed, {
        hasBindings: false,
        hasStreamingBinding: false,
      }),
      capabilities: parsed!.capabilities,
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('ARCHETYPE RECIPE: workspace')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)')
  })
})
