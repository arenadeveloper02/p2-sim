/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  GOLD_EXAMPLE_API_KEY,
  GOLD_EXAMPLE_LOAD_API_KEY,
  GOLD_EXAMPLE_RUN_API_KEY,
  goldExampleManifest,
  goldExampleOutput,
  goldExamplePromptForArchetype,
} from '@/lib/arena-generative-ui/gold-example'
import {
  GOLD_DASHBOARD_LOAD_API_KEY,
  GOLD_LIST_DETAIL_LIST_API_KEY,
  GOLD_LIST_DETAIL_RECORD_API_KEY,
  GOLD_WIZARD_SUBMIT_API_KEY,
  goldDashboardManifest,
  goldListDetailManifest,
  goldWizardManifest,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import { extractManifestCandidate } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'

const bindings: ArenaGenerativeApiBinding[] = [
  {
    key: GOLD_EXAMPLE_API_KEY,
    label: 'Search companies',
    kind: 'workflow',
    workflowId: 'wf_gold',
  },
  {
    key: GOLD_EXAMPLE_RUN_API_KEY,
    label: 'Run analysis',
    kind: 'workflow',
    workflowId: 'wf_gold_run',
  },
  {
    key: GOLD_EXAMPLE_LOAD_API_KEY,
    label: 'Company overview',
    kind: 'workflow',
    workflowId: 'wf_gold_metrics',
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
    expect(Object.keys(result.manifest?.pages ?? {})).toEqual([
      'home',
      'results',
      'progress',
      'overview',
    ])
    expect(result.manifest?.entryPath).toBe('home')
  })

  it('is unchanged by normalization, so it models the canonical flat shape', () => {
    const result = validateExample()
    expect(result.manifest?.pages.home.spec).toEqual(goldExampleManifest.pages.home.spec)
    expect(result.manifest?.pages.results.spec).toEqual(goldExampleManifest.pages.results.spec)
    expect(result.manifest?.pages.progress.spec).toEqual(goldExampleManifest.pages.progress.spec)
    expect(result.manifest?.pages.overview.spec).toEqual(goldExampleManifest.pages.overview.spec)
  })

  it('demonstrates the layout primitives the rules ask for', () => {
    const serialized = JSON.stringify(goldExampleManifest)
    for (const type of [
      'PageHeader',
      'SearchField',
      'Chip',
      'Icon',
      'Avatar',
      'EntityHeader',
      'Grid',
      'Stat',
      'Card',
      'Repeat',
      'Tabs',
      'DataText',
    ]) {
      expect(serialized).toContain(`"${type}"`)
    }
    expect(serialized).toContain('"type":"DataText"')
    expect(serialized).not.toContain('"type":"ProgressSteps"')
    expect(serialized).not.toContain('"type":"ProgressBar"')
    expect(serialized).toContain('"align":"center"')
    expect(serialized).toContain('"size":"display"')
    expect(serialized).toContain('"brandColor":"#1A73E8"')
  })

  it('teaches onLoad on the page that fetches its own data, not the search hero', () => {
    const result = validateExample()

    expect(result.manifest?.pages.home.onLoad).toBeUndefined()
    expect(result.manifest?.pages.overview.onLoad).toEqual(['load_overview'])
    expect(JSON.stringify(goldExampleManifest.pages.overview.spec)).toContain(
      '"statePath":"revenue"'
    )
  })

  it('teaches Repeat inside a Grid with per-item title and logo placeholders', () => {
    const results = JSON.stringify(goldExampleManifest.pages.results.spec)
    expect(results).toContain('"type":"Repeat"')
    expect(results).toContain('"statePath":"companies"')
    expect(results).toContain('{item.name}')
    expect(results).toContain('{item.logo}')
    expect(results).toContain('No matching companies.')
    expect(results.indexOf('"type":"Grid"')).toBeLessThan(results.indexOf('"type":"Repeat"'))
  })

  it('embeds the framing and the serialized manifest in the prompt section', () => {
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('GOLD STANDARD REFERENCE LAYOUT')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain(GOLD_EXAMPLE_API_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain(GOLD_EXAMPLE_RUN_API_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('"entryPath": "home"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).not.toContain('```')
  })
})

describe('per-archetype gold examples', () => {
  it('injects only the matching archetype few-shot', () => {
    expect(goldExamplePromptForArchetype('dashboard')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (dashboard)'
    )
    expect(goldExamplePromptForArchetype('dashboard')).not.toContain('Watchtower')
    expect(goldExamplePromptForArchetype('list-detail')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (list-detail)'
    )
    expect(goldExamplePromptForArchetype('wizard')).toContain(
      'GOLD STANDARD REFERENCE LAYOUT (wizard)'
    )
    expect(goldExamplePromptForArchetype('form-result')).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
    expect(goldExamplePromptForArchetype()).toBe(ARENA_GENERATIVE_UI_GOLD_EXAMPLE)
  })

  it('validates the dashboard gold including Sparkline', () => {
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
    expect(JSON.stringify(goldDashboardManifest)).toContain('"Sparkline"')
  })

  it('validates the list-detail gold', () => {
    const result = validateArenaGenerativeManifest(goldListDetailManifest, {
      apiBindings: [
        {
          key: GOLD_LIST_DETAIL_LIST_API_KEY,
          label: 'List',
          kind: 'workflow',
          workflowId: 'wf_list',
        },
        {
          key: GOLD_LIST_DETAIL_RECORD_API_KEY,
          label: 'Record',
          kind: 'workflow',
          workflowId: 'wf_record',
        },
      ],
    })
    expect(result.success).toBe(true)
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
  })
})
