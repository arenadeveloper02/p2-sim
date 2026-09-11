/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import {
  sanitizeHostOwnedCandidate,
  sanitizeHostOwnedManifest,
  stripHostOwnedChrome,
} from '@/lib/arena-generative-ui/strip-host-owned-chrome'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

function pageSpec(elements: Spec['elements'], children: string[]): Spec {
  return {
    root: 'page',
    elements: {
      page: { type: 'Page', props: { title: 'Home' }, children: ['section'] },
      section: {
        type: 'Section',
        props: { padding: null, backgroundColor: null, maxWidth: null },
        children,
      },
      ...elements,
    },
  }
}

function manifestWithPages(
  pages: ArenaGenerativeAppManifest['pages']
): ArenaGenerativeAppManifest {
  return {
    entryPath: 'home',
    pages,
    actions: {},
  }
}

describe('stripHostOwnedChrome', () => {
  it('strips form Spinner, unbound ProgressBar, ProgressSteps, elapsed copy, and orphan Cancel', () => {
    const spec = pageSpec(
      {
        form: { type: 'Form', props: { actionId: 'save' }, children: ['submit'] },
        submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        spin: { type: 'Spinner', props: { label: 'Please wait' }, children: [] },
        bar: { type: 'ProgressBar', props: { value: '0' }, children: [] },
        steps: { type: 'ProgressSteps', props: { steps: 'Saving' }, children: [] },
        elapsed: { type: 'Text', props: { text: 'Elapsed 12s' }, children: [] },
        cancel: { type: 'Button', props: { label: 'Cancel' }, children: [] },
        working: {
          type: 'WorkingCard',
          props: { title: 'Working', steps: 'Saving' },
          children: [],
        },
      },
      ['form', 'spin', 'bar', 'steps', 'elapsed', 'cancel', 'working']
    )
    const result = stripHostOwnedChrome(spec, { pagePath: 'home' })
    const types = Object.values(result.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).not.toContain('Spinner')
    expect(types).not.toContain('ProgressBar')
    expect(types).not.toContain('ProgressSteps')
    expect(types).toContain('WorkingCard')
    expect(types).toContain('Form')
    expect(result.spec.elements?.elapsed).toBeUndefined()
    expect(result.spec.elements?.cancel).toBeUndefined()
    expect(result.changes.some((change) => change.code === 'host-wait-chrome')).toBe(true)
  })

  it('keeps a ProgressBar bound to an API percent', () => {
    const spec = pageSpec(
      {
        form: { type: 'Form', props: { actionId: 'save' }, children: ['submit'] },
        submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        bar: { type: 'ProgressBar', props: { statePath: 'percent' }, children: [] },
      },
      ['form', 'bar']
    )
    const result = stripHostOwnedChrome(spec, { pagePath: 'home' })
    expect(result.spec.elements?.bar).toBeTruthy()
  })

  it('strips host-event Alert, Toast, delete Modal, and Refresh', () => {
    const spec = pageSpec(
      {
        alert: {
          type: 'Alert',
          props: { title: 'Something went wrong', text: 'Retry' },
          children: [],
        },
        toast: { type: 'Toast', props: { text: 'Saved successfully' }, children: [] },
        modal: {
          type: 'Modal',
          props: { title: 'Delete this row?' },
          children: ['destroy'],
        },
        destroy: {
          type: 'Button',
          props: { label: 'Delete', variant: 'destructive', actionId: 'delete_row' },
          children: [],
        },
        refresh: { type: 'Button', props: { label: 'Refresh' }, children: [] },
        disclaimer: {
          type: 'Alert',
          props: { title: 'Disclaimer', text: 'Estimates only.' },
          children: [],
        },
        create: {
          type: 'Modal',
          props: { title: 'Add a todo', showWhen: 'creating' },
          children: [],
        },
      },
      ['alert', 'toast', 'modal', 'refresh', 'disclaimer', 'create']
    )
    const result = stripHostOwnedChrome(spec, { pagePath: 'home' })
    expect(result.spec.elements?.alert).toBeUndefined()
    expect(result.spec.elements?.toast).toBeUndefined()
    expect(result.spec.elements?.modal).toBeUndefined()
    expect(result.spec.elements?.refresh).toBeUndefined()
    expect(result.spec.elements?.disclaimer).toBeTruthy()
    expect(result.spec.elements?.create).toBeTruthy()
    expect(result.changes.map((change) => change.code)).toEqual(
      expect.arrayContaining(['host-notify-chrome', 'host-refresh'])
    )
  })

  it('does not strip a named remote Refresh CTA with its own apiKey', () => {
    const spec = pageSpec(
      {
        refresh: {
          type: 'Button',
          props: { label: 'Refresh from Salesforce', actionId: 'sync_salesforce' },
          children: [],
        },
      },
      ['refresh']
    )
    const result = stripHostOwnedChrome(spec, {
      pagePath: 'home',
      actionApiKeys: { sync_salesforce: 'salesforce' },
    })
    expect(result.spec.elements?.refresh).toBeTruthy()
    expect(result.changes).toEqual([])
  })

  it('strips item.output from Repeat cards and leaves short fields', () => {
    const spec = pageSpec(
      {
        list: { type: 'Repeat', props: { statePath: 'items' }, children: ['card'] },
        card: {
          type: 'Card',
          props: { title: '{item.keyword}', description: '{item.output}' },
          children: ['body'],
        },
        body: {
          type: 'DataText',
          props: { statePath: 'item.output', fallback: '' },
          children: [],
        },
      },
      ['list']
    )
    const result = stripHostOwnedChrome(spec, { pagePath: 'history' })
    expect(result.spec.elements?.body).toBeUndefined()
    const card = result.spec.elements?.card as { props?: { title?: string; description?: unknown } }
    expect(card.props?.title).toBe('{item.keyword}')
    expect(card.props?.description).toBeNull()
    expect(result.changes.some((change) => change.code === 'repeat-prose')).toBe(true)
  })
})

describe('sanitizeHostOwnedManifest', () => {
  it('drops unrequested dashboard and history from a one-page todo', () => {
    const home: Spec = pageSpec(
      {
        heading: { type: 'Heading', props: { text: 'Todos', level: 'h1' }, children: [] },
      },
      ['heading']
    )
    const extra: Spec = pageSpec(
      {
        heading: { type: 'Heading', props: { text: 'Stats', level: 'h1' }, children: [] },
      },
      ['heading']
    )
    const result = sanitizeHostOwnedManifest(
      manifestWithPages({
        home: { path: 'home', title: 'Todos', spec: home },
        dashboard: { path: 'dashboard', title: 'Dashboard', spec: extra },
        history: { path: 'history', title: 'History', spec: extra },
      }),
      { userInput: 'Simple todo app. One page.' }
    )
    expect(Object.keys(result.manifest.pages)).toEqual(['home'])
    expect(result.adoptedChanges.some((change) => change.code === 'unrequested-pages')).toBe(true)
  })

  it('keeps history when the brief listed it', () => {
    const page: Spec = pageSpec(
      {
        heading: { type: 'Heading', props: { text: 'Runs', level: 'h1' }, children: [] },
      },
      ['heading']
    )
    const result = sanitizeHostOwnedManifest(
      manifestWithPages({
        home: { path: 'home', title: 'Generator', spec: page },
        history: { path: 'history', title: 'History', spec: page },
      }),
      { allowedPagePaths: ['home', 'history'], userInput: 'Generator and History' }
    )
    expect(Object.keys(result.manifest.pages).sort()).toEqual(['history', 'home'])
  })
})

describe('sanitizeHostOwnedCandidate', () => {
  it('drops extra pages before validate would see them', () => {
    const result = sanitizeHostOwnedCandidate(
      {
        entryPath: 'home',
        pages: {
          home: {
            path: 'home',
            title: 'Todos',
            spec: pageSpec(
              { heading: { type: 'Heading', props: { text: 'Todos', level: 'h1' }, children: [] } },
              ['heading']
            ),
          },
          dashboard: {
            path: 'dashboard',
            title: 'Dashboard',
            spec: pageSpec(
              { heading: { type: 'Heading', props: { text: 'KPIs', level: 'h1' }, children: [] } },
              ['heading']
            ),
          },
        },
        actions: {},
      },
      { allowedPagePaths: ['home'], entryPath: 'home' }
    )
    expect(Object.keys(result.candidate.pages as object)).toEqual(['home'])
    expect(result.adoptedChanges[0]?.code).toBe('unrequested-pages')
  })
})
