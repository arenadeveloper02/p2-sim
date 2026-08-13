import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'

function pageSpec(options: { root?: string; extra?: Record<string, unknown> } = {}): Spec {
  return {
    root: 'page',
    elements: {
      page: {
        type: 'Page',
        props: { title: 'Home', backgroundColor: null },
        children: ['stack'],
      },
      stack: {
        type: 'Stack',
        props: { direction: 'vertical', gap: '12px', align: null },
        children: ['nav', 'form'],
      },
      nav: {
        type: 'NavLink',
        props: { label: 'Results', to: 'results' },
        children: [],
      },
      form: {
        type: 'Form',
        props: { actionId: 'submit_lead' },
        children: ['submit'],
      },
      submit: {
        type: 'SubmitButton',
        props: { label: 'Submit', actionId: null },
        children: [],
      },
      ...options.extra,
    },
  }
}

function resultsSpec(): Spec {
  return {
    root: 'page',
    elements: {
      page: {
        type: 'Page',
        props: { title: 'Results', backgroundColor: null },
        children: ['back'],
      },
      back: {
        type: 'Button',
        props: {
          label: 'Back',
          href: null,
          navigateTo: 'home',
          actionId: null,
          backgroundColor: null,
          color: null,
        },
        children: [],
      },
    },
  }
}

describe('validateArenaGenerativeManifest', () => {
  const bindings = [
    { key: 'qualify_lead', label: 'Qualify', kind: 'workflow' as const, workflowId: 'wf-1' },
  ]

  it('accepts a reachable two-page app with a declared apiKey', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(true)
  })

  it('accepts pages emitted as an array of { path, title, spec }', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: [
          { title: 'Home', path: 'home', spec: pageSpec() },
          { title: 'Results', path: 'results', spec: resultsSpec() },
        ],
        actions: {},
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.title).toBe('Home')
    expect(result.manifest?.pages.results.title).toBe('Results')
  })

  it('accepts a navigation-only app when API bindings are empty', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.actions).toEqual({})
    const homeElements = result.manifest?.pages.home.spec.elements as Record<
      string,
      { props?: { actionId?: unknown } }
    >
    expect(homeElements.form.props?.actionId).toBeUndefined()
  })

  it('rejects an unknown apiKey', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'other_api' },
        },
      },
      { apiBindings: bindings }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unknown API key/)
  })

  it('rejects navigate targets that are not pages', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'missing' } },
        },
      },
      { apiBindings: bindings }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not a page|unknown path|Unreachable/)
  })

  it('rejects orphan pages', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: {
              root: 'page',
              elements: {
                page: {
                  type: 'Page',
                  props: { title: 'Home', backgroundColor: null },
                  children: [],
                },
              },
            },
          },
          orphan: {
            title: 'Orphan',
            path: 'orphan',
            spec: {
              root: 'page',
              elements: {
                page: {
                  type: 'Page',
                  props: { title: 'Orphan', backgroundColor: null },
                  children: [],
                },
              },
            },
          },
        },
        actions: {},
      },
      { apiBindings: [] }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unreachable pages/)
  })
})
