/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import {
  twoPageApiBindings,
  twoPageHomeSpec,
  twoPageManifest,
} from '@/lib/arena-generative-ui/two-page-app.fixture'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import {
  compileGenerativeUx,
  inferAsyncKind,
  specHasLoadingSurface,
  UX_COMPILER_STATUS_KEY,
} from '@/lib/arena-generative-ui/ux-compiler'

function samePageSubmitSpec(): Spec {
  return {
    root: 'page',
    elements: {
      page: {
        type: 'Page',
        props: { title: 'Save', backgroundColor: null },
        children: ['section'],
      },
      section: {
        type: 'Section',
        props: { padding: null, backgroundColor: null, maxWidth: null, width: null },
        children: ['form'],
      },
      form: {
        type: 'Form',
        props: { actionId: 'save', align: null },
        children: ['submit'],
      },
      submit: {
        type: 'SubmitButton',
        props: { label: 'Save', actionId: null, size: null, variant: null, shape: null },
        children: [],
      },
    },
  }
}

describe('inferAsyncKind', () => {
  it('treats onLoad as a query', () => {
    expect(inferAsyncKind({ usedOnLoad: true, binding: { kind: 'workflow' } })).toBe('query')
  })

  it('treats workflow and stream bindings as long-running', () => {
    expect(inferAsyncKind({ usedOnLoad: false, binding: { kind: 'workflow' } })).toBe('longRunning')
    expect(inferAsyncKind({ usedOnLoad: false, binding: { kind: 'http', stream: true } })).toBe(
      'longRunning'
    )
  })

  it('treats other HTTP CTAs as mutations', () => {
    expect(inferAsyncKind({ usedOnLoad: false, binding: { kind: 'http' } })).toBe('mutation')
  })
})

describe('compileGenerativeUx', () => {
  it('does not mutate the input manifest', () => {
    const originalHome = JSON.stringify(twoPageManifest.pages.home.spec)
    const compiled = compileGenerativeUx(twoPageManifest, twoPageApiBindings)
    compiled.pages.home.spec.elements = {}
    expect(JSON.stringify(twoPageManifest.pages.home.spec)).toBe(originalHome)
  })

  it('leaves the two-page fixture pixel-identical because results already bind DataText', () => {
    const compiled = compileGenerativeUx(twoPageManifest, twoPageApiBindings)
    expect(compiled.pages.home.spec).toEqual(structuredClone(twoPageHomeSpec))
    expect(compiled.pages.results.spec).toEqual(structuredClone(twoPageManifest.pages.results.spec))
    expect(compiled.uxPlan.fallbackLoading).toEqual({})
    expect(specHasLoadingSurface(twoPageManifest.pages.results.spec)).toBe(true)
  })

  it('skips inject when a bound Table already covers query loading', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: {
          title: 'List',
          path: 'home',
          onLoad: ['fetch_rows'],
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Page', props: { title: 'List' }, children: ['table'] },
              table: {
                type: 'Table',
                props: { statePath: 'rows', columns: 'name', rows: null, emptyText: null },
                children: [],
              },
            },
          },
        },
      },
      actions: {
        fetch_rows: { apiKey: 'list' },
      },
    }
    const compiled = compileGenerativeUx(manifest, [{ key: 'list', label: 'List', kind: 'http' }])
    expect(compiled.pages.home.spec).toEqual(structuredClone(manifest.pages.home.spec))
    expect(compiled.uxPlan.fallbackLoading).toEqual({})
  })

  it('injects indeterminate status on a same-page submit with no loading surface', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: { title: 'Save', path: 'home', spec: samePageSubmitSpec() },
      },
      actions: {
        save: { apiKey: 'save' },
      },
    }
    const before = structuredClone(manifest.pages.home.spec)
    const compiled = compileGenerativeUx(manifest, [{ key: 'save', label: 'Save', kind: 'http' }])
    expect(manifest.pages.home.spec).toEqual(before)
    expect(compiled.uxPlan.fallbackLoading.home).toBe('status')
    expect(compiled.pages.home.spec.elements?.[UX_COMPILER_STATUS_KEY]).toEqual({
      type: 'Spinner',
      props: { label: 'Working…' },
      children: [],
    })
    const section = compiled.pages.home.spec.elements?.section as { children?: string[] }
    expect(section.children?.[0]).toBe(UX_COMPILER_STATUS_KEY)
  })

  it('does not inject ticking ProgressSteps', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: { title: 'Save', path: 'home', spec: samePageSubmitSpec() },
      },
      actions: {
        save: { apiKey: 'save' },
      },
    }
    const compiled = compileGenerativeUx(manifest, [
      { key: 'save', label: 'Save', kind: 'workflow', workflowId: 'wf-1' },
    ])
    const types = Object.values(compiled.pages.home.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).not.toContain('ProgressSteps')
    expect(types).toContain('Spinner')
  })
})
