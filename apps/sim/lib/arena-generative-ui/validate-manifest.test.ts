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
            onLoad: ['load_results', 'load_results'],
          },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          load_results: { apiKey: 'qualify_lead' },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.onLoad).toEqual(['submit_lead'])
    expect(result.manifest?.pages.results.onLoad).toEqual(['load_results'])
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
    expect(result.error).toContain('submit_lead')
  })

  it('names declared action keys when a page actionId is missing from actions', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          search_companies: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      },
      { apiBindings: bindings, entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('references unknown action "submit_lead"')
    expect(result.error).toContain('search_companies')
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

  it('strips invented apiKeys and keeps dummy actions when bindings are empty', () => {
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
    expect(result.manifest?.actions.submit_lead?.apiKey).toBeUndefined()
    expect(result.manifest?.actions.submit_lead?.onSuccess?.navigate).toBe('results')
    const homeElements = result.manifest?.pages.home.spec.elements as Record<
      string,
      { props?: { actionId?: unknown } }
    >
    expect(homeElements.form.props?.actionId).toBe('submit_lead')
  })

  it('keeps dummy onLoad when invented apiKeys have no bindings', () => {
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
                  props: { statePath: 'items' },
                  children: ['row'],
                },
                row: {
                  type: 'NavLink',
                  props: { label: '{item.title}', to: 'results?id={item.id}' },
                  children: [],
                },
              },
            }),
            onLoad: ['load_items'],
          },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          load_items: {
            apiKey: 'list_items',
            onSuccess: {
              setState: { items: [{ id: 'i1', title: 'Ship' }] },
            },
          },
          submit_lead: {
            apiKey: 'create_item',
            onSuccess: { setState: { creating: true } },
          },
        },
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home.onLoad).toEqual(['load_items'])
    expect(result.manifest?.actions.load_items?.apiKey).toBeUndefined()
    expect(result.manifest?.actions.submit_lead?.apiKey).toBeUndefined()
    expect(result.manifest?.actions.load_items?.onSuccess?.setState).toEqual({
      items: [{ id: 'i1', title: 'Ship' }],
    })
  })

  it('rejects a dummy Repeat that has no onLoad seed and no Table.rows', () => {
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
                  props: { statePath: 'items' },
                  children: ['row'],
                },
                row: {
                  type: 'NavLink',
                  props: { label: '{item.title}', to: 'results?id={item.id}' },
                  children: [],
                },
              },
            }),
          },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: {
          submit_lead: { onSuccess: { setState: { creating: true } } },
        },
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('statePath "items" has no dummy rows')
    expect(result.error).toContain('does not invent Repeat items')
  })

  it('accepts dummy Table.rows plus statePath without onLoad', () => {
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
                  children: ['table'],
                },
                table: {
                  type: 'Table',
                  props: {
                    columns: 'Name, Role',
                    rows: 'Ada | Engineer',
                    statePath: 'people',
                    emptyText: null,
                  },
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
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  })

  it('accepts a dummy Repeat filled only by a CTA setState array', () => {
    const result = validateArenaGenerativeManifest(
      {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: {
            title: 'Results',
            path: 'results',
            spec: {
              root: 'page',
              elements: {
                page: {
                  type: 'Page',
                  props: { title: 'Results', backgroundColor: null },
                  children: ['back', 'list'],
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
                list: {
                  type: 'Repeat',
                  props: { statePath: 'leads' },
                  children: ['row'],
                },
                row: {
                  type: 'NavLink',
                  props: { label: '{item.name}', to: 'home' },
                  children: [],
                },
              },
            },
          },
        },
        actions: {
          submit_lead: {
            onSuccess: {
              navigate: 'results',
              setState: { leads: [{ id: 'l1', name: 'Acme' }] },
            },
          },
        },
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
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

  it('rejects Tabs items that share a page path', () => {
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
                  props: { items: 'Generator|home\nHistory|home', activePath: 'home' },
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
    expect(result.error).toMatch(/repeats path "home"/)
  })

  it('rejects a list-only History page gated on !selectedId', () => {
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
                  children: ['heading', 'to-history'],
                },
                heading: {
                  type: 'Heading',
                  props: { text: 'Home', level: 'h1', color: null },
                  children: [],
                },
                'to-history': {
                  type: 'NavLink',
                  props: { label: 'History', to: 'history' },
                  children: [],
                },
              },
            },
          },
          history: {
            title: 'History',
            path: 'history',
            spec: {
              root: 'page',
              elements: {
                page: {
                  type: 'Page',
                  props: { title: 'History', backgroundColor: null },
                  children: ['list'],
                },
                list: {
                  type: 'Repeat',
                  props: { statePath: 'history', showWhen: '!selectedId' },
                  children: ['open'],
                },
                open: {
                  type: 'Button',
                  props: {
                    label: 'Open',
                    href: null,
                    navigateTo: 'home',
                    actionId: null,
                    selectItem: true,
                    clearItem: null,
                    setValue: null,
                    variant: null,
                    size: null,
                    shape: null,
                    showWhen: null,
                  },
                  children: [],
                },
              },
            },
            onLoad: ['load_history'],
          },
        },
        actions: {
          load_history: {
            onSuccess: { setState: { history: [{ id: 'h1', keyword: 'Dental' }] } },
          },
        },
      },
      { apiBindings: [], entryPath: 'home' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/dedicated History list/)
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

  /**
   * A SubmitButton with no Form ancestor and no actionId submits nothing and runs
   * nothing. The form-less-but-bound variant is explicitly allowed, because the
   * host wires that one to a click.
   */
  describe('dead SubmitButton', () => {
    function formlessPage(submitProps: Record<string, unknown>): Spec {
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
            children: ['nav', 'submit'],
          },
          nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
          submit: { type: 'SubmitButton', props: submitProps, children: [] },
        },
      }
    }

    function manifestWith(spec: Spec) {
      return {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: { submit_lead: { apiKey: 'qualify_lead' } },
      }
    }

    it('rejects one with neither a Form ancestor nor an actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(formlessPage({ label: 'Submit', actionId: null })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('not inside a Form and has no actionId')
      expect(result.error).toContain('submit')
    })

    it('accepts one outside a Form that carries an actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(formlessPage({ label: 'Submit', actionId: 'submit_lead' })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('ignores the defect on a page a scoped edit did not author', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(formlessPage({ label: 'Submit', actionId: null })),
        { apiBindings: bindings, entryPath: 'home', authoredPagePaths: ['results'] }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('still reports it on a page the reply did author', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(formlessPage({ label: 'Submit', actionId: null })),
        { apiBindings: bindings, entryPath: 'home', authoredPagePaths: ['home'] }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('not inside a Form and has no actionId')
    })

    it('accepts one nested deep inside a Form with no actionId of its own', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Home', backgroundColor: null },
            children: ['nav', 'form'],
          },
          nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
          form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['card'] },
          card: {
            type: 'Card',
            props: { title: 'Details', description: null },
            children: ['submit'],
          },
          submit: {
            type: 'SubmitButton',
            props: { label: 'Submit', actionId: null },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(manifestWith(spec), {
        apiBindings: bindings,
        entryPath: 'home',
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })
  })

  describe('dead Button', () => {
    function buttonPage(buttonProps: Record<string, unknown>): Spec {
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
            children: ['nav', 'action'],
          },
          nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
          action: { type: 'Button', props: buttonProps, children: [] },
        },
      }
    }

    function manifestWith(spec: Spec) {
      return {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
        },
        actions: { submit_lead: { apiKey: 'qualify_lead' } },
      }
    }

    it('rejects one with no verb', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(buttonPage({ label: 'Do something' })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain(
        'no actionId, navigateTo, href, selectItem, clearItem, or setValue'
      )
      expect(result.error).toContain('action')
    })

    it('accepts one with navigateTo', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(buttonPage({ label: 'Results', navigateTo: 'results' })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('accepts one with actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(buttonPage({ label: 'Run', actionId: 'submit_lead' })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('accepts one with setValue to open a Modal', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(buttonPage({ label: 'New item', setValue: 'creating=true' })),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('ignores the defect on a page a scoped edit did not author', () => {
      const result = validateArenaGenerativeManifest(
        manifestWith(buttonPage({ label: 'Do something' })),
        { apiBindings: bindings, entryPath: 'home', authoredPagePaths: ['results'] }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })
  })

  describe('selectItem', () => {
    function homeSpec(): Spec {
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
            children: ['nav', 'history_link', 'form'],
          },
          nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
          history_link: {
            type: 'NavLink',
            props: { label: 'History', to: 'history' },
            children: [],
          },
          form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['submit'] },
          submit: {
            type: 'SubmitButton',
            props: { label: 'Submit', actionId: null },
            children: [],
          },
        },
      }
    }

    function historyPage(openProps: Record<string, unknown>): Spec {
      return {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'History', backgroundColor: null },
            children: ['nav', 'repeat'],
          },
          nav: { type: 'NavLink', props: { label: 'Home', to: 'home' }, children: [] },
          repeat: {
            type: 'Repeat',
            props: { statePath: 'history', emptyText: null },
            children: ['open'],
          },
          open: { type: 'Button', props: openProps, children: [] },
        },
      }
    }

    function manifestWithHistory(historySpec: Spec) {
      return {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: homeSpec() },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
          history: { title: 'History', path: 'history', spec: historySpec },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      }
    }

    it('rejects selectItem combined with actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWithHistory(
          historyPage({
            label: 'Open',
            selectItem: true,
            actionId: 'submit_lead',
            navigateTo: 'results',
            href: null,
          })
        ),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('selectItem and actionId')
    })

    it('rejects selectItem outside Repeat', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'History', backgroundColor: null },
            children: ['nav', 'open'],
          },
          nav: { type: 'NavLink', props: { label: 'Home', to: 'home' }, children: [] },
          open: {
            type: 'Button',
            props: {
              label: 'Open',
              selectItem: true,
              actionId: null,
              navigateTo: 'results',
              href: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(manifestWithHistory(spec), {
        apiBindings: bindings,
        entryPath: 'home',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('selectItem outside Repeat')
    })

    it('accepts selectItem on a Repeat Button with navigateTo and no actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWithHistory(
          historyPage({
            label: 'Open',
            selectItem: true,
            actionId: null,
            navigateTo: 'results',
            href: null,
          })
        ),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('rejects clearItem combined with actionId', () => {
      const result = validateArenaGenerativeManifest(
        manifestWithHistory(
          historyPage({
            label: 'Back',
            clearItem: true,
            actionId: 'submit_lead',
            selectItem: null,
            navigateTo: null,
            href: null,
          })
        ),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('clearItem and actionId')
    })

    it('rejects clearItem combined with selectItem', () => {
      const result = validateArenaGenerativeManifest(
        manifestWithHistory(
          historyPage({
            label: 'Open',
            clearItem: true,
            selectItem: true,
            actionId: null,
            navigateTo: null,
            href: null,
          })
        ),
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('clearItem and selectItem')
    })

    it('accepts a clearItem Back outside Repeat', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'History', backgroundColor: null },
            children: ['nav', 'repeat', 'back'],
          },
          nav: { type: 'NavLink', props: { label: 'Home', to: 'home' }, children: [] },
          repeat: {
            type: 'Repeat',
            props: { statePath: 'history', emptyText: null },
            children: ['open'],
          },
          open: {
            type: 'Button',
            props: {
              label: 'Open',
              selectItem: true,
              actionId: null,
              navigateTo: null,
              href: null,
            },
            children: [],
          },
          back: {
            type: 'Button',
            props: {
              label: 'Back',
              clearItem: true,
              actionId: null,
              navigateTo: null,
              href: null,
              showWhen: 'selectedId',
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(manifestWithHistory(spec), {
        apiBindings: bindings,
        entryPath: 'home',
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })
  })

  describe('binding layout', () => {
    const historyBinding = {
      key: 'run_history',
      label: 'History',
      kind: 'workflow' as const,
      workflowId: 'wf-history',
      outputSchema: [
        { name: 'run_data.history', type: 'array' },
        { name: 'run_data.history[].keyword', type: 'string' },
        { name: 'run_data.history[].output', type: 'string' },
      ],
    }

    function pagesWithHistory(historySpec: Spec) {
      return {
        entryPath: 'home',
        pages: {
          home: {
            title: 'Home',
            path: 'home',
            spec: pageSpec({
              extra: {
                history_link: {
                  type: 'NavLink',
                  props: { label: 'History', to: 'history' },
                  children: [],
                },
              },
            }),
          },
          results: { title: 'Results', path: 'results', spec: resultsSpec() },
          history: { title: 'History', path: 'history', spec: historySpec },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          load_history: { apiKey: 'run_history' },
        },
      }
    }

    const scoredBinding = {
      key: 'qualify_lead',
      label: 'Qualify',
      kind: 'workflow' as const,
      workflowId: 'wf-1',
      outputSchema: [
        { name: 'articles', type: 'array' },
        { name: 'articles[].title', type: 'string' },
        { name: 'score', type: 'number' },
      ],
    }

    function resultsPlanSpec(): Spec {
      return {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'score', 'table'],
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
          score: {
            type: 'Stat',
            props: {
              label: 'Score',
              value: null,
              statePath: 'score',
              hint: null,
              delta: null,
              deltaTone: null,
              size: null,
            },
            children: [],
          },
          table: {
            type: 'Table',
            props: { columns: 'title', rows: null, statePath: 'articles', emptyText: null },
            children: [],
          },
        },
      }
    }

    function scoredPages(results: Spec) {
      return {
        entryPath: 'home',
        pages: {
          home: { title: 'Home', path: 'home', spec: pageSpec() },
          results: { title: 'Results', path: 'results', spec: results },
        },
        actions: {
          submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
        },
      }
    }

    function historyRepeat(
      statePath: string,
      extra?: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }>
    ): Spec {
      return {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'History', backgroundColor: null },
            children: ['nav', 'repeat'],
          },
          nav: { type: 'NavLink', props: { label: 'Home', to: 'home' }, children: [] },
          repeat: {
            type: 'Repeat',
            props: { statePath, emptyText: null },
            children: ['keyword'],
          },
          keyword: {
            type: 'DataText',
            props: { statePath: 'item.keyword', fallback: '', color: null, size: null },
            children: [],
          },
          ...extra,
        },
      }
    }

    it('rejects Repeat bound to the nested schema path instead of the lifted hostKey', () => {
      const result = validateArenaGenerativeManifest(
        pagesWithHistory(historyRepeat('run_data.history')),
        {
          apiBindings: [...bindings, historyBinding],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('run_data.history')
      expect(result.error).toContain('"history"')
    })

    it('accepts Repeat bound to the lifted hostKey', () => {
      const result = validateArenaGenerativeManifest(
        pagesWithHistory(
          historyRepeat('history', {
            body: {
              type: 'DataText',
              props: { statePath: 'content', fallback: '', color: null, size: null },
              children: [],
            },
          })
        ),
        {
          apiBindings: [...bindings, historyBinding],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('rejects a used binding whose layoutPlan hostKeys are never bound', () => {
      const result = validateArenaGenerativeManifest(scoredPages(resultsSpec()), {
        apiBindings: [scoredBinding],
        entryPath: 'home',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('qualify_lead')
      expect(result.error).toContain('articles')
      expect(result.error).toContain('score')
    })

    it('does not require host key data when History sample is a Response markdown envelope', () => {
      const envelopeHistory = {
        key: 'run_history',
        label: 'History',
        kind: 'workflow' as const,
        workflowId: 'wf-history',
        outputSchema: [
          { name: 'data', type: 'string' },
          { name: 'status', type: 'number' },
          { name: 'headers', type: 'object' },
        ],
      }
      const pages = pagesWithHistory(historyRepeat('items'))
      pages.pages.history = { ...pages.pages.history, onLoad: ['load_history'] }
      const result = validateArenaGenerativeManifest(pages, {
        apiBindings: [...bindings, envelopeHistory],
        entryPath: 'home',
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('accepts Table and Stat bound to the plan hostKeys', () => {
      const result = validateArenaGenerativeManifest(scoredPages(resultsPlanSpec()), {
        apiBindings: [scoredBinding],
        entryPath: 'home',
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('still sees hostKeys bound on a page a scoped edit did not author', () => {
      const result = validateArenaGenerativeManifest(scoredPages(resultsPlanSpec()), {
        apiBindings: [scoredBinding],
        entryPath: 'home',
        authoredPagePaths: ['home'],
      })

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('rejects item.output inside Repeat when the plan marks it as prose', () => {
      const spec = historyRepeat('history', {
        keyword: {
          type: 'DataText',
          props: { statePath: 'item.output', fallback: '', color: null, size: null },
          children: [],
        },
      })
      const result = validateArenaGenerativeManifest(pagesWithHistory(spec), {
        apiBindings: [...bindings, historyBinding],
        entryPath: 'home',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('item.output')
    })

    it('rejects DataText bound to field.content when the field is a string', () => {
      const streamBinding = {
        key: 'recommend_articles',
        label: 'Recommend',
        kind: 'workflow' as const,
        workflowId: 'wf-rec',
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      }
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'body'],
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
          body: {
            type: 'DataText',
            props: {
              statePath: 'artical_data.content',
              fallback: '',
              color: null,
              size: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: [streamBinding], entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('artical_data.content')
    })

    it('rejects Copy Markdown that rebinds the generate API', () => {
      const streamBinding = {
        key: 'recommend_articles',
        label: 'Recommend',
        kind: 'workflow' as const,
        workflowId: 'wf-rec',
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      }
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'copy', 'body'],
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
          copy: {
            type: 'Button',
            props: {
              label: 'Copy Markdown',
              href: null,
              navigateTo: null,
              actionId: 'submit_lead',
              backgroundColor: null,
              color: null,
            },
            children: [],
          },
          body: {
            type: 'DataText',
            props: {
              statePath: 'content',
              fallback: '',
              color: null,
              size: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: [streamBinding], entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Copy Markdown')
      expect(result.error).toContain('recommend_articles')
    })

    it('rejects Download PDF Chip that rebinds the generate API', () => {
      const streamBinding = {
        key: 'recommend_articles',
        label: 'Recommend',
        kind: 'workflow' as const,
        workflowId: 'wf-rec',
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      }
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'download', 'body'],
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
          download: {
            type: 'Chip',
            props: {
              text: 'Download PDF',
              tone: null,
              actionId: 'submit_lead',
              navigateTo: null,
              setValue: null,
            },
            children: [],
          },
          body: {
            type: 'DataText',
            props: {
              statePath: 'content',
              fallback: '',
              color: null,
              size: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: [streamBinding], entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Download PDF')
      expect(result.error).toContain('recommend_articles')
    })

    it('rejects DataText showWhen on a different prose key than statePath', () => {
      const streamBinding = {
        key: 'recommend_articles',
        label: 'Recommend',
        kind: 'workflow' as const,
        workflowId: 'wf-rec',
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      }
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'section'],
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
          section: {
            type: 'Stack',
            props: {
              direction: 'vertical',
              gap: '12px',
              align: null,
              showWhen: 'artical_data',
            },
            children: ['body'],
          },
          body: {
            type: 'DataText',
            props: {
              statePath: 'content',
              fallback: '',
              color: null,
              size: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: [streamBinding], entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('showWhen')
      expect(result.error).toContain('content')
    })

    it('accepts DataText showWhen that matches its statePath', () => {
      const streamBinding = {
        key: 'recommend_articles',
        label: 'Recommend',
        kind: 'workflow' as const,
        workflowId: 'wf-rec',
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      }
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'section'],
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
          section: {
            type: 'Stack',
            props: {
              direction: 'vertical',
              gap: '12px',
              align: null,
              showWhen: 'content',
            },
            children: ['body'],
          },
          body: {
            type: 'DataText',
            props: {
              statePath: 'content',
              fallback: '',
              color: null,
              size: null,
            },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: [streamBinding], entryPath: 'home' }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('rejects onLoad of a navigate-first action on the destination page', () => {
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: {
              title: 'Results',
              path: 'results',
              spec: resultsSpec(),
              onLoad: ['submit_lead'],
            },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('onLoad')
      expect(result.error).toContain('submit_lead')
    })

    it('rejects a form that omits a declared form input', () => {
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
        {
          apiBindings: [
            {
              ...bindings[0],
              inputSchema: [{ name: 'targetKeyword', type: 'string' }],
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('targetKeyword')
    })

    it('rejects a form field that is not in inputSchema', () => {
      const spec = pageSpec({
        extra: {
          company: {
            type: 'TextInput',
            props: { name: 'company', label: 'Company', required: true, placeholder: '' },
            children: [],
          },
          notes: {
            type: 'TextInput',
            props: { name: 'notes', label: 'Notes', required: false, placeholder: '' },
            children: [],
          },
          form: {
            type: 'Form',
            props: { actionId: 'submit_lead' },
            children: ['company', 'notes', 'submit'],
          },
        },
      })
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec },
            results: { title: 'Results', path: 'results', spec: resultsSpec() },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              inputSchema: [{ name: 'company', type: 'string' }],
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('notes')
    })

    it('rejects a form field the host fills as a constant', () => {
      const spec = pageSpec({
        extra: {
          type_field: {
            type: 'TextInput',
            props: { name: 'type', label: 'Type', required: false, placeholder: '' },
            children: [],
          },
          form: {
            type: 'Form',
            props: { actionId: 'submit_lead' },
            children: ['type_field', 'submit'],
          },
        },
      })
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec },
            results: { title: 'Results', path: 'results', spec: resultsSpec() },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              inputSchema: [{ name: 'type', type: 'string', source: 'constant', value: 'history' }],
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('constant')
    })

    it('rejects envelope statePaths even without outputSchema', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'table'],
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
          table: {
            type: 'Table',
            props: { columns: 'title', rows: null, statePath: 'data.articles', emptyText: null },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        { apiBindings: bindings, entryPath: 'home' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('data.articles')
    })

    it('rejects a form control named for a reserved Start field', () => {
      const spec = pageSpec({
        extra: {
          input: {
            type: 'TextArea',
            props: { name: 'input', label: 'Message', required: true, placeholder: '' },
            children: [],
          },
          form: {
            type: 'Form',
            props: { actionId: 'submit_lead' },
            children: ['input', 'submit'],
          },
        },
      })
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec },
            results: { title: 'Results', path: 'results', spec: resultsSpec() },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              chatProtocol: { input: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('reserved start field')
    })

    it('rejects a chat-only binding that never emits Chat', () => {
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
        {
          apiBindings: [
            {
              ...bindings[0],
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Add a Chat')
    })

    it('accepts Chat on results for a chat-only binding', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'chat'],
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
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('rejects stream plus chat protocol when the destination has neither Chat nor DataText content', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Home', backgroundColor: null },
            children: ['nav', 'form', 'chat'],
          },
          nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
          form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['submit'] },
          submit: {
            type: 'SubmitButton',
            props: { label: 'Submit', actionId: null },
            children: [],
          },
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec },
            results: { title: 'Results', path: 'results', spec: resultsSpec() },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              stream: true,
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('streams with chat protocol')
      expect(result.error).toContain('results')
    })

    it('accepts a same-page streamed Chat without onSuccess.navigate', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Chat', backgroundColor: null },
            children: ['chat'],
          },
          chat: {
            type: 'Chat',
            props: { actionId: 'ask', placeholder: 'Ask a question' },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Chat', path: 'home', spec },
          },
          actions: {
            ask: { apiKey: 'chat_api' },
          },
        },
        {
          apiBindings: [
            {
              key: 'chat_api',
              label: 'Chat',
              kind: 'workflow',
              workflowId: 'wf-chat',
              stream: true,
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('accepts stream plus chat protocol when Chat is on the destination', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'chat'],
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
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              stream: true,
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('accepts stream plus chat protocol when DataText content is on the destination', () => {
      const home: Spec = pageSpec({
        extra: {
          company: {
            type: 'TextInput',
            props: { name: 'company_name', label: 'Company', required: true, placeholder: '' },
            children: [],
          },
          form: {
            type: 'Form',
            props: { actionId: 'submit_lead' },
            children: ['company', 'submit'],
          },
        },
      })
      const results: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'body'],
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
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '', color: null, size: null },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: home },
            results: { title: 'Results', path: 'results', spec: results },
          },
          actions: {
            submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              ...bindings[0],
              stream: true,
              inputSchema: [{ name: 'company_name', type: 'string' }],
              chatProtocol: { input: true, conversationId: true },
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })

    it('treats Chat as binding streamed content for a structured stream plan', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: {
            type: 'Page',
            props: { title: 'Results', backgroundColor: null },
            children: ['back', 'chat'],
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
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const result = validateArenaGenerativeManifest(
        {
          entryPath: 'home',
          pages: {
            home: { title: 'Home', path: 'home', spec: pageSpec() },
            results: { title: 'Results', path: 'results', spec },
          },
          actions: {
            submit_lead: { apiKey: 'recommend_articles', onSuccess: { navigate: 'results' } },
          },
        },
        {
          apiBindings: [
            {
              key: 'recommend_articles',
              label: 'Recommend',
              kind: 'workflow' as const,
              workflowId: 'wf-rec',
              stream: true,
              chatProtocol: { input: true, conversationId: true },
              outputSchema: [{ name: 'artical_data', type: 'string' }],
            },
          ],
          entryPath: 'home',
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    })
  })
})
