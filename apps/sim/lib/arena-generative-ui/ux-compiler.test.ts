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
import { goldListDetailManifest } from '@/lib/arena-generative-ui/gold-example-archetypes'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import {
  compiledPageFromManifest,
  compileGenerativeUx,
  inferAsyncKind,
  injectSamePageSelectChrome,
  specHasLoadingSurface,
  UX_COMPILER_SELECT_BACK_KEY,
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

  it('relocates ProgressSteps from a navigate-first form onto results', () => {
    const homeWithSteps: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Form' }, children: ['section'] },
        section: {
          type: 'Section',
          props: { padding: null, backgroundColor: null, maxWidth: null },
          children: ['form', 'steps'],
        },
        form: {
          type: 'Form',
          props: { actionId: 'submit_lead' },
          children: ['submit'],
        },
        submit: {
          type: 'SubmitButton',
          props: { label: 'Submit', actionId: null, size: null, variant: null, shape: null },
          children: [],
        },
        steps: {
          type: 'ProgressSteps',
          props: { steps: 'Connecting\nScoring' },
          children: [],
        },
      },
    }
    const resultsBare: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['section'] },
        section: {
          type: 'Section',
          props: { padding: null, backgroundColor: null, maxWidth: null },
          children: ['heading'],
        },
        heading: { type: 'Heading', props: { text: 'Score', level: 'h2' }, children: [] },
      },
    }
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: { title: 'Form', path: 'home', spec: homeWithSteps },
        results: { title: 'Score', path: 'results', spec: resultsBare },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
      },
    }
    const compiled = compileGenerativeUx(manifest, twoPageApiBindings)
    const homeTypes = Object.values(compiled.pages.home.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    const resultsTypes = Object.values(compiled.pages.results.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(homeTypes).not.toContain('ProgressSteps')
    expect(resultsTypes).toContain('ProgressSteps')
    const resultsSection = compiled.pages.results.spec.elements?.section as { children?: string[] }
    expect(resultsSection.children?.[0]).toBe('steps')
  })

  it('keeps ProgressSteps on a same-page submit', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Save' }, children: ['section'] },
        section: {
          type: 'Section',
          props: { padding: null, backgroundColor: null, maxWidth: null },
          children: ['form', 'steps'],
        },
        form: { type: 'Form', props: { actionId: 'save' }, children: ['submit'] },
        submit: {
          type: 'SubmitButton',
          props: { label: 'Save', actionId: null, size: null, variant: null, shape: null },
          children: [],
        },
        steps: {
          type: 'ProgressSteps',
          props: { steps: 'Saving' },
          children: [],
        },
      },
    }
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: { title: 'Save', path: 'home', spec },
      },
      actions: {
        save: { apiKey: 'save' },
      },
    }
    const compiled = compileGenerativeUx(manifest, [{ key: 'save', label: 'Save', kind: 'http' }])
    const types = Object.values(compiled.pages.home.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).toContain('ProgressSteps')
    expect(types).not.toContain('Spinner')
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

function brokenSamePageHistorySpec(): Spec {
  return {
    root: 'page',
    elements: {
      page: { type: 'Page', props: { title: 'History' }, children: ['section'] },
      section: {
        type: 'Section',
        props: {},
        children: ['grid', 'body'],
      },
      grid: { type: 'Grid', props: { columns: '2' }, children: ['repeat'] },
      repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
      open: {
        type: 'Button',
        props: { label: 'Open', selectItem: true },
        children: [],
      },
      body: {
        type: 'DataText',
        props: { statePath: 'content', fallback: '' },
        children: [],
      },
    },
  }
}

function wiredSamePageHistorySpec(): Spec {
  return {
    root: 'page',
    elements: {
      page: { type: 'Page', props: { title: 'History' }, children: ['section'] },
      section: {
        type: 'Section',
        props: {},
        children: ['grid', 'detail'],
      },
      grid: {
        type: 'Grid',
        props: { columns: '2', showWhen: '!selectedId' },
        children: ['repeat'],
      },
      repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
      open: {
        type: 'Button',
        props: { label: 'Open', selectItem: true },
        children: [],
      },
      detail: {
        type: 'Section',
        props: { showWhen: 'selectedId' },
        children: ['back', 'body'],
      },
      back: {
        type: 'Button',
        props: { label: 'Back', clearItem: true, variant: 'ghost', showWhen: 'selectedId' },
        children: [],
      },
      body: {
        type: 'DataText',
        props: { statePath: 'content', fallback: '', showWhen: 'selectedId' },
        children: [],
      },
    },
  }
}

describe('injectSamePageSelectChrome', () => {
  it('does not mutate the input spec', () => {
    const spec = brokenSamePageHistorySpec()
    const before = JSON.stringify(spec)
    injectSamePageSelectChrome(spec, 'history')
    expect(JSON.stringify(spec)).toBe(before)
  })

  it('leaves a well-wired same-page History spec unchanged', () => {
    const spec = wiredSamePageHistorySpec()
    expect(injectSamePageSelectChrome(spec, 'history')).toEqual(structuredClone(spec))
  })

  it('hides the list Grid, reveals content DataText, and injects a clearItem Back', () => {
    const compiled = injectSamePageSelectChrome(brokenSamePageHistorySpec(), 'history')
    const elements = compiled.elements as Record<string, { props?: Record<string, unknown> }>
    expect(elements.grid?.props?.showWhen).toBe('!selectedId')
    expect(elements.repeat?.props?.showWhen).toBeUndefined()
    expect(elements.body?.props?.showWhen).toBe('selectedId')
    expect(elements[UX_COMPILER_SELECT_BACK_KEY]).toEqual({
      type: 'Button',
      props: {
        label: 'Back',
        clearItem: true,
        variant: 'ghost',
        showWhen: 'selectedId',
      },
      children: [],
    })
    const section = compiled.elements?.section as { children?: string[] }
    expect(section.children).toEqual(['grid', UX_COMPILER_SELECT_BACK_KEY, 'body'])
  })

  it('hides a list-only Section and shows a sibling detail Section', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['list', 'detail'] },
        list: { type: 'Section', props: {}, children: ['repeat'] },
        repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
        open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
        detail: { type: 'Section', props: {}, children: ['body'] },
        body: { type: 'DataText', props: { statePath: 'content' }, children: [] },
      },
    }
    const compiled = injectSamePageSelectChrome(spec, 'history')
    const elements = compiled.elements as Record<string, { props?: Record<string, unknown> }>
    expect(elements.list?.props?.showWhen).toBe('!selectedId')
    expect(elements.detail?.props?.showWhen).toBe('selectedId')
    expect(elements.body?.props?.showWhen).toBeUndefined()
    const detail = compiled.elements?.detail as { children?: string[] }
    expect(detail.children?.[0]).toBe(UX_COMPILER_SELECT_BACK_KEY)
  })

  it('does not invent a DataText when the spec omitted one', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['repeat'] },
        repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
        open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
      },
    }
    const compiled = injectSamePageSelectChrome(spec, 'history')
    const types = Object.values(compiled.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).not.toContain('DataText')
    expect(compiled.elements?.[UX_COMPILER_SELECT_BACK_KEY]).toBeTruthy()
    expect(
      (compiled.elements?.repeat as { props?: Record<string, unknown> }).props?.showWhen
    ).toBe('!selectedId')
  })

  it('does not inject Back when a clearItem button already exists', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['repeat', 'body', 'back'] },
        repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
        open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
        body: { type: 'DataText', props: { statePath: 'content' }, children: [] },
        back: {
          type: 'Button',
          props: { label: 'Back', clearItem: true, showWhen: 'selectedId' },
          children: [],
        },
      },
    }
    const compiled = injectSamePageSelectChrome(spec, 'history')
    expect(compiled.elements?.[UX_COMPILER_SELECT_BACK_KEY]).toBeUndefined()
  })

  it('does not rewrite selectItem that navigates to another page', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['repeat', 'body'] },
        repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['open'] },
        open: {
          type: 'Button',
          props: { label: 'Open', selectItem: true, navigateTo: 'results' },
          children: [],
        },
        body: { type: 'DataText', props: { statePath: 'content' }, children: [] },
      },
    }
    expect(injectSamePageSelectChrome(spec, 'history')).toEqual(structuredClone(spec))
  })

  it('is idempotent', () => {
    const once = injectSamePageSelectChrome(brokenSamePageHistorySpec(), 'history')
    const twice = injectSamePageSelectChrome(once, 'history')
    expect(twice).toEqual(once)
  })
})

describe('compiledPageFromManifest', () => {
  it('returns undefined for an unknown path', () => {
    expect(compiledPageFromManifest(twoPageManifest, twoPageApiBindings, 'missing')).toBeUndefined()
  })

  it('relocates navigate-first ProgressSteps onto the destination page', () => {
    const homeWithSteps: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Form' }, children: ['section'] },
        section: {
          type: 'Section',
          props: { padding: null, backgroundColor: null, maxWidth: null },
          children: ['form', 'steps'],
        },
        form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['submit'] },
        submit: {
          type: 'SubmitButton',
          props: { label: 'Submit', actionId: null, size: null, variant: null, shape: null },
          children: [],
        },
        steps: {
          type: 'ProgressSteps',
          props: { steps: 'Connecting\nScoring' },
          children: [],
        },
      },
    }
    const resultsBare: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['section'] },
        section: {
          type: 'Section',
          props: { padding: null, backgroundColor: null, maxWidth: null },
          children: ['heading'],
        },
        heading: { type: 'Heading', props: { text: 'Score', level: 'h2' }, children: [] },
      },
    }
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: { title: 'Form', path: 'home', spec: homeWithSteps },
        results: { title: 'Score', path: 'results', spec: resultsBare },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
      },
    }

    const home = compiledPageFromManifest(manifest, twoPageApiBindings, 'home')
    const results = compiledPageFromManifest(manifest, twoPageApiBindings, 'results')
    const homeTypes = Object.values(home?.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    const resultsTypes = Object.values(results?.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(homeTypes).not.toContain('ProgressSteps')
    expect(resultsTypes).toContain('ProgressSteps')
  })

  it('leaves the list-detail gold pages unchanged', () => {
    const home = compiledPageFromManifest(goldListDetailManifest, [], 'home')
    const detail = compiledPageFromManifest(goldListDetailManifest, [], 'detail')
    expect(home?.spec).toEqual(structuredClone(goldListDetailManifest.pages.home.spec))
    expect(detail?.spec).toEqual(structuredClone(goldListDetailManifest.pages.detail.spec))
  })

  it('compiles same-page Open chrome onto a broken History page', () => {
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'history',
      pages: {
        history: { title: 'History', path: 'history', spec: brokenSamePageHistorySpec() },
      },
      actions: {},
    }
    const page = compiledPageFromManifest(manifest, [], 'history')
    const elements = page?.spec.elements as Record<string, { props?: Record<string, unknown> }>
    expect(elements.grid?.props?.showWhen).toBe('!selectedId')
    expect(elements.body?.props?.showWhen).toBe('selectedId')
    expect(elements[UX_COMPILER_SELECT_BACK_KEY]).toBeTruthy()
  })
})
