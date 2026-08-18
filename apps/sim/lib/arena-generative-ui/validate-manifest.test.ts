import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import {
  GENERATOR_OMITTED_PAGES_ERROR,
  validateArenaGenerativeManifest,
} from '@/lib/arena-generative-ui/validate-manifest'

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

  it('keeps a valid manifest.theme and drops an invalid brand colour', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        theme: { brandColor: '#2563eb', radius: 'md', density: 'comfortable', extra: true },
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
    expect(result.manifest?.theme).toEqual({
      brandColor: '#2563eb',
      radius: 'md',
      density: 'comfortable',
    })

    const dropped = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        theme: { brandColor: 'blue' },
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
    expect(dropped.success).toBe(true)
    expect(dropped.manifest?.theme).toBeUndefined()
  })

  it('keeps a page onLoad that names a declared action', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec(), onLoad: ['submit_lead'] },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.onLoad).toEqual(['submit_lead'])
    expect(result.manifest?.pages.results.onLoad).toBeUndefined()
  })

  it('accepts a navigation target that carries query params for the destination onLoad', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: pageSpec({
              extra: {
                nav: { type: 'NavLink', props: { label: 'Results', to: 'results?id=lead_7' } },
              },
            }),
          },
          results: {
            title: 'Results',
            path: 'results',
            spec: resultsSpec(),
            onLoad: ['submit_lead'],
          },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead' },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(true)
  })

  it('accepts a Repeat navigation target whose path is a page and whose query is an item placeholder', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: pageSpec({
              extra: {
                stack: {
                  type: 'Stack',
                  props: { direction: 'vertical', gap: '12px', align: null },
                  children: ['nav', 'form', 'list'],
                },
                list: {
                  type: 'Repeat',
                  props: { statePath: 'leads' },
                  children: ['row'],
                },
                row: {
                  type: 'NavLink',
                  props: { label: '{item.name}', to: 'results?id={item.id}' },
                  children: [],
                },
              },
            }),
          },
          results: {
            title: 'Results',
            path: 'results',
            spec: resultsSpec(),
            onLoad: ['submit_lead'],
          },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead' },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  })

  it('still rejects a navigation target whose path half is not a page', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: pageSpec({
              extra: {
                nav: { type: 'NavLink', props: { label: 'Nope', to: 'missing?id=1' } },
              },
            }),
          },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('navigates to unknown path "missing"')
  })

  it('accepts a single onLoad id emitted as a bare string and drops duplicates', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec(), onLoad: 'submit_lead' },
          results: {
            title: 'Results',
            path: 'results',
            spec: resultsSpec(),
            onLoad: ['submit_lead', 'submit_lead'],
          },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.onLoad).toEqual(['submit_lead'])
    expect(result.manifest?.pages.results.onLoad).toEqual(['submit_lead'])
  })

  it('rejects an onLoad that names an action the manifest never declares', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec(), onLoad: ['load_metrics'] },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('onLoad references unknown action "load_metrics"')
  })

  it('drops onLoad from a navigation-only app, which has no APIs to call', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec(), onLoad: ['submit_lead'] },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {},
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.onLoad).toBeUndefined()
  })

  it('rejects a page that declares more onLoad actions than the cap allows', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: pageSpec(),
            onLoad: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
          },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('at most 6 are allowed')
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

  it('folds a pages array without path using title and home', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: [
          { title: 'Home', spec: pageSpec() },
          { title: 'Results', spec: resultsSpec() },
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

  it('treats Tabs item paths as navigation so tabbed pages are reachable', () => {
    const tabbedSpec = (title: string): Spec => ({
      root: 'page',
      elements: {
        page: {
          type: 'Page',
          props: { title, backgroundColor: null },
          children: ['tabs'],
        },
        tabs: {
          type: 'Tabs',
          props: { items: 'Home|home\nReports|reports', activePath: 'home' },
          children: [],
        },
      },
    })
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: tabbedSpec('Home') },
          reports: { title: 'Reports', path: 'reports', spec: tabbedSpec('Reports') },
        },
        actions: {},
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
  })

  it('rejects a Tabs item pointing at a path that is not a page', () => {
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
                  children: ['tabs'],
                },
                tabs: {
                  type: 'Tabs',
                  props: { items: 'Home|home\nGhost|ghost', activePath: 'home' },
                  children: [],
                },
              },
            },
          },
        },
        actions: {},
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unknown path "ghost"/)
  })

  it('accepts layout and display components from the widened catalog', () => {
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
                  children: ['section'],
                },
                section: {
                  type: 'Section',
                  props: {
                    padding: '24px',
                    backgroundColor: null,
                    maxWidth: null,
                    width: 'wide',
                  },
                  children: ['header', 'grid', 'table'],
                },
                header: {
                  type: 'PageHeader',
                  props: { title: 'Dashboard', subtitle: 'This week' },
                  children: [],
                },
                grid: {
                  type: 'Grid',
                  props: { columns: '3', gap: '16px', minItemWidth: null },
                  children: ['stat'],
                },
                stat: {
                  type: 'Stat',
                  props: { label: 'Matches', value: '42', statePath: null, hint: null },
                  children: [],
                },
                table: {
                  type: 'Table',
                  props: { columns: 'Name, Role', rows: 'Ada | Engineer', statePath: null },
                  children: [],
                },
              },
            },
          },
        },
        actions: {},
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
  })

  it('explains omitted pages without implying the Pages field must be filled', () => {
    const result = validateArenaGenerativeManifest(
      { entryPath: 'home' },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe(GENERATOR_OMITTED_PAGES_ERROR)
    expect(result.error).not.toMatch(/keyed by page path/)
  })
})
