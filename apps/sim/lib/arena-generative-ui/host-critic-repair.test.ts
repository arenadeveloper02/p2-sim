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
    expect(result.adoptedChanges).toEqual([
      {
        code: 'extra-primary',
        asked: 'Section "section" on page "home" had more than one primary action (search, go).',
        adopted: 'Kept "search" as primary; changed "go" to a secondary Button.',
      },
    ])
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
})
