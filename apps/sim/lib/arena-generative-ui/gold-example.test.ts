/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  GOLD_EXAMPLE_API_KEY,
  goldExampleManifest,
  goldExampleOutput,
  goldExamplePromptForArchetype,
} from '@/lib/arena-generative-ui/gold-example'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE,
  GOLD_CONTENT_LOAD_API_KEY,
  GOLD_DASHBOARD_LOAD_API_KEY,
  GOLD_WIZARD_SUBMIT_API_KEY,
  goldCollectionManifest,
  goldContentManifest,
  goldDashboardManifest,
  goldListDetailManifest,
  goldWizardManifest,
  goldWorkspaceManifest,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import { extractManifestCandidate } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'

const bindings: ArenaGenerativeApiBinding[] = [
  {
    key: GOLD_EXAMPLE_API_KEY,
    label: 'Analyze company',
    kind: 'workflow',
    workflowId: 'wf_gold',
  },
]

/** Runs the example through the same envelope unwrap the generator uses. */
function validateExample() {
  return validateArenaGenerativeManifest(extractManifestCandidate(goldExampleOutput), {
    apiBindings: bindings,
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
    expect(serialized).toContain('"align":"center"')
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
    expect(goldExamplePromptForArchetype()).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
  })

  it('validates the dashboard gold including Chart', () => {
    const result = validateArenaGenerativeManifest(goldDashboardManifest, {
      apiBindings: [
        {
          key: GOLD_DASHBOARD_LOAD_API_KEY,
          label: 'Dashboard',
          kind: 'workflow',
          workflowId: 'wf_dash',
        },
      ],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Chart"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Filter"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Table"')
    expect(JSON.stringify(goldDashboardManifest)).toContain('"gap":"md"')
    expect(JSON.stringify(goldDashboardManifest)).not.toMatch(/"gap":"(?:8|12|16|24)px"/)
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
    expect(JSON.stringify(goldCollectionManifest)).toContain('"statePath":"items"')
    expect(JSON.stringify(goldCollectionManifest.actions.load_items)).not.toContain('apiKey')
    expect(JSON.stringify(goldCollectionManifest)).not.toContain('"navigateTo": "')
    expect(JSON.stringify(goldCollectionManifest)).not.toContain('"Workspace"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION).toContain('Do not invent API keys')
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
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL).toContain('Do not invent API keys')
  })

  it('validates the wizard gold', () => {
    const result = validateArenaGenerativeManifest(goldWizardManifest, {
      apiBindings: [
        {
          key: GOLD_WIZARD_SUBMIT_API_KEY,
          label: 'Submit',
          kind: 'workflow',
          workflowId: 'wf_onboard',
        },
      ],
    })
    expect(result.success).toBe(true)
    expect(JSON.stringify(goldWizardManifest)).toContain('"Stepper"')
  })

  it('validates the content gold', () => {
    const result = validateArenaGenerativeManifest(goldContentManifest, {
      apiBindings: [
        {
          key: GOLD_CONTENT_LOAD_API_KEY,
          label: 'Article',
          kind: 'workflow',
          workflowId: 'wf_article',
        },
      ],
    })
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
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
    expect(JSON.stringify(goldWorkspaceManifest)).toContain('"Modal"')
    expect(JSON.stringify(goldWorkspaceManifest.actions.load_projects)).not.toContain('apiKey')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain(
      'Honour pages[].regions and pages[].interaction'
    )
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).toContain('projectId matching a parent id')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE).not.toContain('not a page archetype')
  })
})
