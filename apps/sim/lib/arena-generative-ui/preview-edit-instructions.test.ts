/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildPreviewEditInstructions,
  catalogTypesFromManifest,
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
})

describe('catalogTypesFromManifest', () => {
  it('lists types used in the generated app', () => {
    expect(catalogTypesFromManifest(twoPageManifest)).toEqual(
      expect.arrayContaining(['Page', 'Section', 'Form', 'SubmitButton', 'DataText'])
    )
  })
})
