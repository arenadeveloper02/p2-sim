/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  GOLD_EXAMPLE_API_KEY,
  GOLD_MULTI_EXAMPLE_PREFACE,
  goldExampleManifest,
  goldExampleOutput,
  goldExamplePromptForArchetype,
  selectGoldExampleKeys,
} from '@/lib/arena-generative-ui/gold-example'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TIMELINE,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE,
  GOLD_AGENT_SHELL_GENERATE_KEY,
  GOLD_AGENT_SHELL_HISTORY_KEY,
  goldAgentShellManifest,
  goldCalendarManifest,
  goldCollectionManifest,
  goldContentManifest,
  goldDashboardManifest,
  goldListDetailManifest,
  goldTableManifest,
  goldTimelineManifest,
  goldWizardManifest,
  goldWorkspaceManifest,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import { extractManifestCandidate } from '@/lib/arena-generative-ui/parse-inputs'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'

/** Runs the example through the same envelope unwrap the generator uses. */
function validateExample() {
  return validateArenaGenerativeManifest(extractManifestCandidate(goldExampleOutput), {
    apiBindings: [],
  })
}

describe('gold example', () => {
  it('passes manifest validation so the prompt never teaches an invalid shape', () => {
    const result = validateExample()
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  })

  it('keeps every page reachable from the entry path', () => {
    const result = validateExample()
    expect(Object.keys(result.manifest?.pages ?? {})).toEqual(['home', 'results'])
    expect(result.manifest?.entryPath).toBe('home')
  })

  it('stays a flat spec; normalize resolves spacing tokens to host CSS vars', () => {
    const result = validateExample()
    const source = JSON.stringify(goldExampleManifest)
    expect(source).toContain('"gap":"sm"')
    expect(source).toContain('"padding":"lg"')
    expect(source).toContain('"variant":"default"')
    expect(source).not.toMatch(/"gap":"(?:8|12|16|24)px"/)
    expect(source).not.toMatch(/"padding":"(?:8|12|16|24)px"/)

    for (const path of ['home', 'results'] as const) {
      const authored = goldExampleManifest.pages[path].spec
      const normalized = result.manifest?.pages[path].spec
      expect(normalized?.root).toBe(authored.root)
      expect(Object.keys(normalized?.elements ?? {}).sort()).toEqual(
        Object.keys(authored.elements).sort()
      )
    }
    const resolved = JSON.stringify(result.manifest?.pages.home.spec)
    expect(resolved).toContain('var(--gui-space-sm')
    expect(JSON.stringify(result.manifest?.pages.results.spec)).toContain('var(--gui-space-lg')
  })

  it('demonstrates the layout primitives the rules ask for', () => {
    const serialized = JSON.stringify(goldExampleManifest)
    for (const type of [
      'AppHeader',
      'PageHeader',
      'SearchField',
      'Chip',
      'Card',
      'DataText',
      'WorkingCard',
    ]) {
      expect(serialized).toContain(`"${type}"`)
    }
    expect(serialized).toContain('"type":"DataText"')
    expect(serialized).toContain('"type":"WorkingCard"')
    expect(serialized).not.toContain('"type":"ProgressSteps"')
    expect(serialized).not.toContain('"type":"ProgressBar"')
    expect(serialized).not.toContain('"type":"Tabs"')
    expect(serialized).not.toContain('Watchtower')
    expect(serialized).toContain('"align":"start"')
    expect(serialized).toContain('"width":"narrow"')
    expect(serialized).not.toContain('"width":"wide"')
    expect(serialized).not.toContain('"kicker":"Research"')
    expect(serialized).not.toContain('"align":"center"')
    expect(serialized).toContain('"brandColor":"#1A73E8"')
  })

  it('teaches onLoad stays off the form and the CTA destination', () => {
    const result = validateExample()

    expect(result.manifest?.pages.home.onLoad).toBeUndefined()
    expect(result.manifest?.pages.results.onLoad).toBeUndefined()
    expect(JSON.stringify(goldExampleManifest.pages.results.spec)).toContain(
      '"statePath":"content"'
    )
  })

  it('does not teach a history page, SWOT modules, or result-card Repeat', () => {
    const serialized = JSON.stringify(goldExampleManifest)
    expect(serialized).not.toContain('history')
    expect(serialized).not.toContain('overview')
    expect(serialized).not.toContain('SWOT')
    expect(serialized).not.toContain('"type":"Repeat"')
    expect(serialized).not.toContain('companies')
  })

  it('embeds the framing and the serialized manifest in the prompt section', () => {
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('GOLD STANDARD REFERENCE LAYOUT')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain(GOLD_EXAMPLE_API_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('company_search')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('Do not invent API keys')
    expect(JSON.stringify(goldExampleManifest.actions.analyze_company)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('two screens')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).not.toContain('four screens')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('"entryPath": "home"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('Honour pages[]')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).not.toContain('Match this structure')
  })
})

describe('per-archetype gold examples', () => {
  it('injects only the matching archetype few-shot', () => {
    expect(goldExamplePromptForArchetype('dashboard')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (dashboard)'
    )
    expect(goldExamplePromptForArchetype('dashboard')).toContain('spacing tokens')
    expect(goldExamplePromptForArchetype('dashboard')).toContain('Card.variant')
    expect(goldExamplePromptForArchetype('dashboard')).not.toContain('Watchtower')
    expect(goldExamplePromptForArchetype('collection')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (collection)'
    )
    expect(goldExamplePromptForArchetype('workflow')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (workflow)'
    )
    expect(goldExamplePromptForArchetype('content')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (content)'
    )
    expect(
      goldExamplePromptForArchetype('collection', { shell: { navigation: 'sidebar' } })
    ).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(
      goldExamplePromptForArchetype('collection', { shell: { navigation: 'sidebar' } })
    ).not.toContain('GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)')
    expect(
      goldExamplePromptForArchetype('collection', {
        pageArchetypes: ['collection', 'detail'],
      })
    ).toContain('GOLD STANDARD REFERENCE LAYOUT (list-detail)')
    expect(goldExamplePromptForArchetype('collection')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (collection)'
    )
    expect(goldExamplePromptForArchetype('collection', { needsCalendar: true })).toBe(
      ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR
    )
    expect(goldExamplePromptForArchetype('collection', { needsTimeline: true })).toBe(
      ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TIMELINE
    )
    expect(goldExamplePromptForArchetype('collection', { needsTables: true })).toBe(
      ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE
    )
    expect(
      goldExamplePromptForArchetype('collection', { needsTables: true, needsCalendar: true })
    ).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR)
    expect(goldExamplePromptForArchetype('collection')).not.toContain(
      'GOLD STANDARD REFERENCE LAYOUT (list-detail)'
    )
    expect(goldExamplePromptForArchetype('workspace')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)'
    )
    expect(goldExamplePromptForArchetype('collection', { hasRegions: true })).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)'
    )
    expect(goldExamplePromptForArchetype('task')).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
    expect(
      goldExamplePromptForArchetype('task', {
        pageArchetypes: ['task', 'results'],
        shell: { navigation: 'tabs' },
      })
    ).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL)
    expect(
      goldExamplePromptForArchetype('task', {
        pageArchetypes: ['task', 'results', 'collection'],
        shell: { navigation: 'tabs' },
      })
    ).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL)
    expect(goldExamplePromptForArchetype('task', { pageArchetypes: ['task', 'results'] })).toBe(
      ARENA_GENERATIVE_UI_GOLD_EXAMPLE
    )
    expect(goldExamplePromptForArchetype()).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
  })

  it('covers uncovered page jobs with unique golds (max 3)', () => {
    expect(selectGoldExampleKeys('task', { pageArchetypes: ['task', 'collection'] })).toEqual([
      'task',
      'collection',
    ])
    expect(
      selectGoldExampleKeys('task', { pageArchetypes: ['task', 'results', 'collection'] })
    ).toEqual(['task', 'collection'])
    expect(
      selectGoldExampleKeys('task', {
        pageArchetypes: ['task', 'results', 'collection'],
        shell: { navigation: 'tabs' },
      })
    ).toEqual(['agent-shell'])
    expect(
      selectGoldExampleKeys('collection', { pageArchetypes: ['collection', 'detail'] })
    ).toEqual(['list-detail'])
    expect(selectGoldExampleKeys('collection', { needsTables: true })).toEqual(['table'])
    expect(selectGoldExampleKeys('task')).toEqual(['task'])
    expect(
      selectGoldExampleKeys('task', {
        pageArchetypes: ['task', 'collection', 'dashboard', 'workflow'],
      })
    ).toEqual(['task', 'collection', 'dashboard'])
  })

  it('concatenates task + collection golds and does not merge sitemaps', () => {
    const prompt = goldExamplePromptForArchetype('task', {
      pageArchetypes: ['task', 'collection'],
    })
    expect(prompt).toContain(GOLD_MULTI_EXAMPLE_PREFACE)
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (task)')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (agent-shell)')
    expect(prompt).not.toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
  })

  it('keeps task+results+collection without tabs off agent-shell gold', () => {
    const prompt = goldExamplePromptForArchetype('task', {
      pageArchetypes: ['task', 'results', 'collection'],
    })
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (task)')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (agent-shell)')
  })

  it('validates the agent product-shell gold', () => {
    const result = validateArenaGenerativeManifest(goldAgentShellManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(Object.keys(goldAgentShellManifest.pages).sort()).toEqual(['history', 'home', 'results'])
    const serialized = JSON.stringify(goldAgentShellManifest)
    expect(serialized).toContain('"type":"Tabs"')
    expect(serialized).toContain('Generator|home')
    expect(serialized).toContain('History|history')
    expect(serialized).not.toContain('Results|results')
    expect(serialized).toContain('"type":"WorkingCard"')
    expect(serialized).toContain('view=enhanced')
    expect(serialized).toContain('view=coverage')
    expect(serialized).toContain('"selectItem":true')
    expect(serialized).toContain('"clearItem":true')
    expect(serialized).toContain('Copy Markdown')
    expect(serialized).toContain('"copyContent":true')
    expect(serialized).toContain('"downloadPdf":true')
    expect(serialized).toContain('!selectedId')
    expect(serialized).toContain('"showWhen":"selectedId"')
    expect(
      JSON.stringify(goldAgentShellManifest.pages.history.spec.elements.open_run)
    ).not.toContain('"navigateTo":"results"')
    expect(serialized).toContain('"statePath":"history"')
    expect(
      JSON.stringify(goldAgentShellManifest.pages.history.spec.elements.history_grid)
    ).toContain('"columns":"2"')
    // Results is not a Tabs peer — keep Generator highlighted via activePath home.
    expect(JSON.stringify(goldAgentShellManifest.pages.results.spec.elements.tabs)).toContain(
      '"activePath":"home"'
    )
    expect(JSON.stringify(goldAgentShellManifest.pages.results.spec.elements.tabs)).not.toContain(
      '"activePath":"results"'
    )
    expect(goldAgentShellManifest.pages.home.onLoad).toBeUndefined()
    expect(goldAgentShellManifest.pages.results.onLoad).toBeUndefined()
    expect(goldAgentShellManifest.pages.history.onLoad).toEqual(['load_history'])
    expect(JSON.stringify(goldAgentShellManifest.actions.generate_article)).toContain(
      '"navigate":"results"'
    )
    expect(JSON.stringify(goldAgentShellManifest.actions.generate_article)).not.toContain('apiKey')
    expect(JSON.stringify(goldAgentShellManifest.actions.load_history)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (agent-shell)'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL).toContain(GOLD_AGENT_SHELL_GENERATE_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL).toContain(GOLD_AGENT_SHELL_HISTORY_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL).toContain('Do not invent API keys')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL).toContain('same-page')
  })

  it('validates the dashboard gold including Chart', () => {
    const result = validateArenaGenerativeManifest(goldDashboardManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Chart"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Filter"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"name":"Status"')
    expect(JSON.stringify(goldDashboardManifest)).not.toContain('"DateInput"')
    expect(JSON.stringify(goldDashboardManifest)).not.toContain('"size":"display"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Table"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"AppHeader"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"gap":"md"')
    expect(JSON.stringify(goldDashboardManifest)).not.toMatch(/"gap":"(?:8|12|16|24)px"/)
    expect(JSON.stringify(goldDashboardManifest.actions.load_dashboard)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD).toContain('Do not invent API keys')
  })

  it('validates the one-page collection gold', () => {
    const result = validateArenaGenerativeManifest(goldCollectionManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(Object.keys(goldCollectionManifest.pages)).toEqual(['home'])
    expect(JSON.stringify(goldCollectionManifest)).toContain('"Modal"')
    expect(JSON.stringify(goldCollectionManifest)).toContain('creating=true')
    expect(JSON.stringify(goldCollectionManifest)).toContain('"create_item"')
    expect(JSON.stringify(goldCollectionManifest)).toContain('"complete_item"')
    expect(JSON.stringify(goldCollectionManifest)).toContain('"edit_item"')
    expect(JSON.stringify(goldCollectionManifest)).toContain('editing=true')
    expect(JSON.stringify(goldCollectionManifest)).toContain('showWhen":"editing"')
    expect(JSON.stringify(goldCollectionManifest.actions.edit_item)).toContain('"editing":false')
    expect(JSON.stringify(goldCollectionManifest.actions.edit_item)).not.toContain('creating')
    expect(JSON.stringify(goldCollectionManifest)).toContain('"statePath":"items"')
    expect(JSON.stringify(goldCollectionManifest.actions.load_items)).not.toContain('apiKey')
    const items = goldCollectionManifest.actions.load_items.onSuccess?.setState?.items
    expect(Array.isArray(items) ? items.length : 0).toBe(4)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION).toContain('4–8 Repeat rows')
    expect(JSON.stringify(goldCollectionManifest)).not.toContain('"navigateTo": "')
    expect(JSON.stringify(goldCollectionManifest)).not.toContain('"Workspace"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION).toContain('Do not invent API keys')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION).toContain('editing=true')
  })

  it('validates the calendar collection gold', () => {
    const result = validateArenaGenerativeManifest(goldCalendarManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldCalendarManifest)).toContain('"Calendar"')
    expect(JSON.stringify(goldCalendarManifest)).toContain('"view":"month"')
    expect(JSON.stringify(goldCalendarManifest.actions.load_events)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR).toContain('Do not invent API keys')
  })

  it('validates the timeline collection gold', () => {
    const result = validateArenaGenerativeManifest(goldTimelineManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldTimelineManifest)).toContain('"Timeline"')
    expect(JSON.stringify(goldTimelineManifest.actions.load_events)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TIMELINE).toContain('Do not invent API keys')
  })

  it('validates the list-detail gold', () => {
    const result = validateArenaGenerativeManifest(goldListDetailManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(Object.keys(goldListDetailManifest.pages)).toEqual(['home', 'detail'])
    expect(goldListDetailManifest.pages.detail.onLoad).toBeUndefined()
    expect(JSON.stringify(goldListDetailManifest)).toContain('"selectItem":true')
    expect(JSON.stringify(goldListDetailManifest)).toContain('detail?id={item.id}')
    expect(JSON.stringify(goldListDetailManifest)).toContain('"statePath":"selected"')
    expect(JSON.stringify(goldListDetailManifest.actions.load_orders)).not.toContain('apiKey')
    const orders = goldListDetailManifest.actions.load_orders.onSuccess?.setState?.orders
    expect(Array.isArray(orders) ? orders.length : 0).toBe(4)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL).toContain('4–8 Repeat rows')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL).toContain('Do not invent API keys')
  })

  it('validates the wizard gold', () => {
    const result = validateArenaGenerativeManifest(goldWizardManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldWizardManifest)).toContain('"Stepper"')
    expect(JSON.stringify(goldWizardManifest.pages.home.spec.elements.stepper)).toContain(
      '"activePath":"home"'
    )
    expect(JSON.stringify(goldWizardManifest.pages.role.spec.elements.stepper)).toContain(
      '"activePath":"role"'
    )
    expect(JSON.stringify(goldWizardManifest.pages.confirm.spec.elements.stepper)).toContain(
      '"activePath":"confirm"'
    )
    expect(JSON.stringify(goldWizardManifest.actions.submit_onboarding)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD).toContain('Do not invent API keys')
  })

  it('validates the content gold', () => {
    const result = validateArenaGenerativeManifest(goldContentManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldContentManifest.actions.load_article)).not.toContain('apiKey')
    expect(JSON.stringify(goldContentManifest)).toContain('"statePath":"content"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT).toContain('Do not invent API keys')
  })

  it('validates the workspace gold', () => {
    const result = validateArenaGenerativeManifest(goldWorkspaceManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"Workspace"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"statePath":"projects"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"statePath":"tasks"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"projectId"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"open_task"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('creating=true')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"create_task"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"complete_task"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"edit_task"')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('editing=true')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('showWhen":"editing"')
    expect(JSON.stringify(goldWorkspaceManifest.actions.edit_task)).toContain('"editing":false')
    expect(JSON.stringify(goldWorkspaceManifest.actions.edit_task)).not.toContain('creating')
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"Modal"')
    expect(JSON.stringify(goldWorkspaceManifest.actions.load_projects)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain(
      'Honour pages[].regions and pages[].interaction'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain('projectId matching a parent id')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain('editing=true')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain(
      'save uses editing: false, not creating: false'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).not.toContain('not a page archetype')
  })

  it('validates the table collection gold', () => {
    const result = validateArenaGenerativeManifest(goldTableManifest, {
      apiBindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldTableManifest)).toContain('"Table"')
    expect(JSON.stringify(goldTableManifest)).toContain('"Filter"')
    expect(JSON.stringify(goldTableManifest)).toContain('"name":"status"')
    expect(JSON.stringify(goldTableManifest)).toContain('"AppHeader"')
    expect(JSON.stringify(goldTableManifest)).not.toContain('"Repeat"')
    expect(JSON.stringify(goldTableManifest.actions.load_orders)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE).toContain('GOLD STANDARD REFERENCE LAYOUT (table)')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE).toContain('Do not invent API keys')
  })

  it('puts AppHeader on every gold page and drops decorative kickers', () => {
    const manifests = [
      goldExampleManifest,
      goldDashboardManifest,
      goldCollectionManifest,
      goldListDetailManifest,
      goldWizardManifest,
      goldContentManifest,
      goldWorkspaceManifest,
      goldAgentShellManifest,
      goldCalendarManifest,
      goldTimelineManifest,
      goldTableManifest,
    ]
    for (const manifest of manifests) {
      const serialized = JSON.stringify(manifest)
      expect(serialized).toContain('"AppHeader"')
      expect(serialized).not.toContain('"kicker":"Inbox"')
      expect(serialized).not.toContain('"kicker":"List"')
      expect(serialized).not.toContain('"kicker":"Calendar"')
      expect(serialized).not.toContain('"kicker":"Timeline"')
      expect(serialized).not.toContain('"kicker":"Research"')
      expect(serialized).not.toContain('Create, edit, and complete stay on this page')
      expect(serialized).not.toContain('Rows include projectId matching')
      expect(serialized).not.toContain('without refetching generate')
    }
  })
})
