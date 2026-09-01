/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import {
  collectRenderDiagnostics,
  editInstructionsFromDiagnostics,
  hostStateHasRoot,
  pageEditPrompt,
} from '@/lib/arena-generative-ui/render-diagnostics'

const spec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: {}, children: ['table', 'repeat', 'widget'] },
    table: { type: 'Table', props: { statePath: 'articles', columns: 'title' }, children: [] },
    repeat: {
      type: 'Repeat',
      props: { statePath: 'item.comments' },
      children: [],
    },
    widget: { type: 'UnknownWidget', props: {}, children: [] },
  },
}

describe('hostStateHasRoot', () => {
  it('treats Repeat item paths as in-scope even when host state is empty', () => {
    expect(hostStateHasRoot({}, 'item.title')).toBe(true)
    expect(hostStateHasRoot({}, 'item')).toBe(true)
  })

  it('requires the top-level key, not a nested walk', () => {
    expect(hostStateHasRoot({ articles: [] }, 'articles')).toBe(true)
    expect(hostStateHasRoot({ articles: [] }, 'articles.title')).toBe(true)
    expect(hostStateHasRoot({}, 'articles')).toBe(false)
  })
})

describe('collectRenderDiagnostics', () => {
  it('skips diagnostics while an action is pending', () => {
    expect(collectRenderDiagnostics(spec, {}, true)).toEqual([])
  })

  it('reports a missing top-level statePath and an unknown catalog type', () => {
    const diagnostics = collectRenderDiagnostics(spec, {}, false)
    expect(diagnostics.map((item) => item.kind)).toEqual(['unresolved-state-path', 'unknown-type'])
    expect(diagnostics[0]?.statePath).toBe('articles')
    expect(diagnostics[1]?.message).toContain('UnknownWidget')
  })

  it('does not treat an empty array as unresolved', () => {
    const diagnostics = collectRenderDiagnostics(spec, { articles: [] }, false)
    expect(diagnostics.some((item) => item.kind === 'unresolved-state-path')).toBe(false)
  })
})

describe('editInstructionsFromDiagnostics', () => {
  it('formats a paste-ready Requested Changes prompt', () => {
    const text = editInstructionsFromDiagnostics(collectRenderDiagnostics(spec, {}, false), 'home')
    expect(text).toContain('Fix these render problems on page "home":')
    expect(text).toContain('Unresolved statePath "articles"')
    expect(text).toContain('Unknown component type "UnknownWidget"')
  })
})

describe('pageEditPrompt', () => {
  it('prefixes Requested Changes with the current page path', () => {
    expect(pageEditPrompt('results')).toBe('On the "results" page, ')
  })
})
