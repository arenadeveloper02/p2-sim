/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { goldCollectionManifest } from '@/lib/arena-generative-ui/gold-example-archetypes'
import {
  buildPreviewEditInstructions,
  catalogTypesFromManifest,
  overlayFlagsFromManifest,
  USER_INPUT_PLACEHOLDER,
} from '@/lib/arena-generative-ui/preview-edit-instructions'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

describe('buildPreviewEditInstructions', () => {
  it('returns empty when there is nothing to edit', () => {
    expect(buildPreviewEditInstructions({ pagePath: 'home' })).toBe('')
  })

  it('turns unresolved statePath into a bind instruction with a placeholder', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      diagnostics: [
        {
          kind: 'unresolved-state-path',
          elementId: 'table',
          statePath: 'articles',
          message: 'Unresolved statePath "articles" on Table "table".',
        },
      ],
    })
    expect(text).toContain('Paste into Requested Changes')
    expect(text).toContain('{user_input}')
    expect(text).toContain('On the "home" page, bind "table" to {user_input}')
    expect(text).toContain('Add an API')
  })

  it('asks to bind a dropped planner action to Add an API', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'detail',
      generateWarnings: [
        {
          code: 'actions-dropped',
          message:
            'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
        },
      ],
    })
    expect(text).toContain('On the "detail" page, bind {user_input} to a key from Add an API')
    expect(text).toContain('dropped an action')
  })

  it('asks to name Workspace coordination after an uncoordinated plan', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      generateWarnings: [
        {
          code: 'uncoordinated-regions',
          message:
            'Planner left page(s) home without pages[].interaction — Workspace regions are uncoordinated. Name selection, inspect, or execution.',
        },
      ],
    })
    expect(text).toContain('On the "home" page, name how regions coordinate as {user_input}')
    expect(text).toContain('selection, inspect, or execution')
  })

  it('asks to re-plan when the planner fell open', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      generateWarnings: [
        {
          code: 'planner-failed',
          message: 'Planner failed (bad json); generated from the prose brief.',
        },
      ],
    })
    expect(text).toContain('Re-plan this app')
    expect(text).toContain(USER_INPUT_PLACEHOLDER)
  })

  it('asks to bind a dropped planner action to Add an API', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'detail',
      generateWarnings: [
        {
          code: 'actions-dropped',
          message:
            'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
        },
      ],
    })
    expect(text).toContain('On the "detail" page, bind {user_input} to a key from Add an API')
    expect(text).toContain('dropped an action')
  })

  it('lets the author pick which primary to keep after a host repair', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'results',
      adoptedChanges: [
        {
          code: 'extra-primary',
          asked: 'Section "section" on page "home" had more than one primary action (submit, go).',
          adopted: 'Kept "submit" as primary; changed "go" to a secondary Button.',
        },
      ],
    })
    expect(text).toContain('On the "home" page, keep {user_input} as the only primary CTA')
  })

  it('maps a screenshot catalog gap to a catalog type', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      screenshotGaps: [{ observed: 'custom kanban board', closestCatalogType: 'Table' }],
    })
    expect(text).toContain('do not add a custom "custom kanban board"')
    expect(text).toContain('Represent it with Table')
  })

  it('asks for Chat when the planner named chat but the app has none', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'results',
      capabilities: ['chat'],
      appCatalogTypes: ['Page', 'DataText'],
      apiBindingKeys: ['ask'],
    })
    expect(text).toContain('add a Chat composer')
    expect(text).toContain('"ask"')
  })

  it('does not ask for Chat when the app already has one', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'results',
      capabilities: ['chat'],
      appCatalogTypes: ['Page', 'Chat'],
      apiBindingKeys: ['ask'],
    })
    expect(text).toBe('')
  })

  it('asks for an edit Modal when the planner named edit but the app only has creating', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      capabilities: ['create', 'edit'],
      appCatalogTypes: ['Page', 'Modal', 'Button'],
      overlayFlags: ['creating'],
    })
    expect(text).toContain('open edit in a Modal')
    expect(text).toContain('editing=true')
    expect(text).toContain('editing: false, not creating: false')
    expect(text).not.toContain('open create in a Modal')
  })

  it('does not ask for edit when the app already has an editing overlay', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      capabilities: ['edit'],
      appCatalogTypes: ['Page', 'Modal'],
      overlayFlags: ['editing'],
    })
    expect(text).toBe('')
  })

  it('asks for create when overlay flags show no creating, even if a Modal exists', () => {
    const text = buildPreviewEditInstructions({
      pagePath: 'home',
      capabilities: ['create'],
      appCatalogTypes: ['Page', 'Modal'],
      overlayFlags: ['editing'],
    })
    expect(text).toContain('open create in a Modal')
  })
})

describe('catalogTypesFromManifest', () => {
  it('lists types used in the generated app', () => {
    expect(catalogTypesFromManifest(twoPageManifest)).toEqual(
      expect.arrayContaining(['Page', 'Section', 'Form', 'SubmitButton', 'DataText'])
    )
  })
})

describe('overlayFlagsFromManifest', () => {
  it('collects creating and editing from setValue and showWhen', () => {
    expect(overlayFlagsFromManifest(goldCollectionManifest)).toEqual(
      expect.arrayContaining(['creating', 'editing'])
    )
  })

  it('finds no overlay flags on a form-only app', () => {
    expect(overlayFlagsFromManifest(twoPageManifest)).toEqual([])
  })
})
