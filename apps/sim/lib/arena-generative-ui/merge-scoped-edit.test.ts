/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { mergeScopedManifestEdit } from '@/lib/arena-generative-ui/merge-scoped-edit'
import { twoPageManifest, twoPageResultsSpec } from '@/lib/arena-generative-ui/two-page-app.fixture'

const RESULTS_ONLY = { pages: ['results'], touchesActions: false, touchesTheme: false }

function editedResultsPage() {
  return {
    path: 'results',
    title: 'Score',
    spec: {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['stat'] },
        stat: { type: 'Stat', props: { label: 'Score', statePath: 'score' }, children: [] },
      },
    },
  }
}

describe('mergeScopedManifestEdit', () => {
  it('leaves an out-of-scope page byte-identical', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { pages: { results: editedResultsPage() } },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const pages = result.candidate.pages as Record<string, unknown>
    expect(JSON.stringify(pages.home)).toBe(JSON.stringify(twoPageManifest.pages.home))
    expect(pages.home).toBe(twoPageManifest.pages.home)
  })

  it('replaces the scoped page with the reply spec', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { pages: { results: editedResultsPage() } },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const pages = result.candidate.pages as Record<string, { spec: { elements: object } }>
    expect(Object.keys(pages.results.spec.elements)).toEqual(['page', 'stat'])
    expect(pages.results.spec).not.toEqual(twoPageResultsSpec)
  })

  it('rejects a page outside the scope and names the allowed set', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { pages: { results: editedResultsPage(), home: { path: 'home', title: 'Form', spec: {} } } },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('"home" was not in scope')
    expect(result.error).toContain('results')
  })

  it('keeps the existing entryPath even when the reply supplies another', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { entryPath: 'results', pages: { results: editedResultsPage() } },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.entryPath).toBe('home')
  })

  it('merges actions key-wise so unreturned actions survive', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      {
        pages: { results: editedResultsPage() },
        actions: { refresh_score: { apiKey: 'qualify_lead' } },
      },
      { ...RESULTS_ONLY, touchesActions: true }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const actions = result.candidate.actions as Record<string, unknown>
    expect(Object.keys(actions).sort()).toEqual(['refresh_score', 'submit_lead'])
    expect(actions.submit_lead).toEqual(twoPageManifest.actions.submit_lead)
  })

  it('ignores actions and theme the scope did not allow', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      {
        pages: { results: editedResultsPage() },
        actions: { submit_lead: { apiKey: 'other' } },
        theme: { brandColor: '#ff0000' },
      },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.actions).toEqual(twoPageManifest.actions)
    expect(result.candidate.theme).toBeUndefined()
  })

  it('accepts a pages array when every entry carries a valid path', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { pages: [editedResultsPage()] },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.candidate.pages as object)).toEqual(['home', 'results'])
  })

  it('rejects a pages array whose entries have no usable path', () => {
    const result = mergeScopedManifestEdit(
      twoPageManifest,
      { pages: [{ title: 'Score', spec: {} }] },
      RESULTS_ONLY
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('keyed by page path')
  })

  it('reports a reply that changed nothing instead of saving a no-op revision', () => {
    const result = mergeScopedManifestEdit(twoPageManifest, { pages: {} }, RESULTS_ONLY)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('changed no pages')
  })
})
