/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import { repairHostCriticExtras } from '@/lib/arena-generative-ui/host-critic-repair'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { hostCriticManifest } from '@/lib/arena-generative-ui/ui-critic'

function pageSpec(elements: Spec['elements'], children: string[]): Spec {
  return {
    root: 'page',
    elements: {
      page: {
        type: 'Page',
        props: { title: 'Page', backgroundColor: null },
        children: ['section'],
      },
      section: {
        type: 'Section',
        props: { padding: null, backgroundColor: null, maxWidth: null },
        children,
      },
      ...elements,
    },
  }
}

function manifestWithHome(spec: Spec): ArenaGenerativeAppManifest {
  return {
    entryPath: 'home',
    pages: {
      home: { path: 'home', title: 'Home', spec },
    },
    actions: {},
  }
}

describe('repairHostCriticExtras', () => {
  it('leaves a clean manifest untouched', () => {
    const result = repairHostCriticExtras(twoPageManifest)
    expect(result.manifest).toBe(twoPageManifest)
    expect(result.adoptedChanges).toEqual([])
  })

  it('keeps SearchField and demotes an extra primary Button', () => {
    const spec = pageSpec(
      {
        search: {
          type: 'SearchField',
          props: { name: 'q', placeholder: 'Search', actionId: 'search' },
          children: [],
        },
        go: {
          type: 'Button',
          props: { label: 'Go', variant: 'primary', navigateTo: 'home', actionId: null },
          children: [],
        },
      },
      ['search', 'go']
    )
    const manifest = manifestWithHome(spec)
    expect(hostCriticManifest(manifest)).toContain('more than one primary action')

    const result = repairHostCriticExtras(manifest)
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    const go = result.manifest.pages.home.spec.elements.go as {
      type?: string
      props?: { variant?: string }
    }
    expect(go.props?.variant).toBe('secondary')
    expect(result.adoptedChanges.some((change) => change.code === 'extra-primary')).toBe(true)
    expect(result.adoptedChanges.some((change) => change.code === 'task-measure')).toBe(true)
    expect(result.manifest.pages.home.spec.elements.section?.props).toMatchObject({
      width: 'narrow',
    })
  })

  it('narrows a wide SearchField hero and left-aligns PageHeader', () => {
    const spec = pageSpec(
      {
        header: {
          type: 'PageHeader',
          props: { title: 'Analyze a company', align: 'center' },
          children: [],
        },
        search: {
          type: 'SearchField',
          props: { name: 'q', placeholder: 'Search', actionId: 'analyze' },
          children: [],
        },
      },
      ['header', 'search']
    )
    const elements = spec.elements as Record<string, { props?: Record<string, unknown> }>
    elements.section.props = { ...elements.section.props, width: 'wide' }
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.section?.props).toMatchObject({
      width: 'narrow',
    })
    expect(result.manifest.pages.home.spec.elements.header?.props).toMatchObject({
      align: 'start',
    })
    expect(result.adoptedChanges.some((change) => change.code === 'task-measure')).toBe(true)
  })

  it('demotes an extra display Heading beside PageHeader', () => {
    const spec = pageSpec(
      {
        header: { type: 'PageHeader', props: { title: 'Analyze' }, children: [] },
        extra: {
          type: 'Heading',
          props: { text: 'Analyze a company', level: 'h1', size: '40px' },
          children: [],
        },
      },
      ['header', 'extra']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.extra?.props).toMatchObject({
      level: 'h2',
      size: null,
    })
    expect(result.adoptedChanges.some((change) => change.code === 'heading-scale')).toBe(true)
  })

  it('keeps SubmitButton and demotes an extra primary Button', () => {
    const spec = pageSpec(
      {
        submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        extra: {
          type: 'Button',
          props: { label: 'Also save', variant: 'primary', actionId: null },
          children: [],
        },
      },
      ['submit', 'extra']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.adoptedChanges[0]?.adopted).toContain('Kept "submit" as primary')
    expect(result.adoptedChanges[0]?.adopted).toContain('"extra" to a secondary Button')
  })

  it('strips a form Spinner and records host-wait-chrome', () => {
    const spec = pageSpec(
      {
        form: { type: 'Form', props: { actionId: 'save' }, children: ['submit'] },
        submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        spin: { type: 'Spinner', props: { label: 'Please wait' }, children: [] },
      },
      ['form', 'spin']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(result.manifest.pages.home.spec.elements?.spin).toBeUndefined()
    expect(result.adoptedChanges.some((change) => change.code === 'host-wait-chrome')).toBe(true)
  })
})
