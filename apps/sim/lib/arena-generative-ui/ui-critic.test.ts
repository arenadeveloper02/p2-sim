/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import { goldExampleManifest } from '@/lib/arena-generative-ui/gold-example'
import {
  goldDashboardManifest,
  goldListDetailManifest,
  goldWizardManifest,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import { multiPageManifest } from '@/lib/arena-generative-ui/multi-page-app.fixture'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import {
  CRITIC_ELEMENT_PROP_KEYS,
  compactManifestForCritic,
  hostCriticManifest,
  MAX_NON_REPEAT_CARDS_PER_PAGE,
} from '@/lib/arena-generative-ui/ui-critic'

const cardProps = {
  title: 'Group',
  subtitle: null,
  description: null,
  footerText: null,
  padding: null,
  backgroundColor: null,
}

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

function manifestWithHome(
  spec: Spec,
  extras?: Partial<ArenaGenerativeAppManifest>
): ArenaGenerativeAppManifest {
  return {
    entryPath: 'home',
    pages: {
      home: { path: 'home', title: 'Home', spec },
    },
    actions: {},
    ...extras,
  }
}

describe('hostCriticManifest', () => {
  it('accepts gold and fixture manifests', () => {
    expect(hostCriticManifest(goldExampleManifest)).toBeUndefined()
    expect(hostCriticManifest(goldDashboardManifest)).toBeUndefined()
    expect(hostCriticManifest(goldListDetailManifest)).toBeUndefined()
    expect(hostCriticManifest(goldWizardManifest)).toBeUndefined()
    expect(hostCriticManifest(twoPageManifest)).toBeUndefined()
    expect(hostCriticManifest(multiPageManifest)).toBeUndefined()
  })

  it('rejects two onLoad actions that share an apiKey', () => {
    const error = hostCriticManifest({
      ...twoPageManifest,
      pages: {
        ...twoPageManifest.pages,
        home: { ...twoPageManifest.pages.home, onLoad: ['load_a', 'load_b'] },
      },
      actions: {
        ...twoPageManifest.actions,
        load_a: { apiKey: 'qualify_lead' },
        load_b: { apiKey: 'qualify_lead' },
      },
    })
    expect(error).toContain('share API key "qualify_lead"')
    expect(error).toContain('load_a')
    expect(error).toContain('load_b')
  })

  it('rejects a Stat with a literal value and no statePath when the app has bindings', () => {
    const spec = pageSpec(
      {
        metric: {
          type: 'Stat',
          props: { label: 'Score', value: '42', statePath: null },
          children: [],
        },
      },
      ['metric']
    )
    const error = hostCriticManifest(
      manifestWithHome(spec, { actions: { load: { apiKey: 'fetch' } } })
    )
    expect(error).toContain('Stat "metric"')
    expect(error).toContain('statePath')
  })

  it('allows a hard-coded Stat when the app has no API bindings', () => {
    const spec = pageSpec(
      {
        metric: {
          type: 'Stat',
          props: { label: 'Score', value: '42', statePath: null },
          children: [],
        },
      },
      ['metric']
    )
    expect(hostCriticManifest(manifestWithHome(spec))).toBeUndefined()
  })

  it('rejects a Sparkline with literal values and no statePath when bindings exist', () => {
    const spec = pageSpec(
      {
        spark: {
          type: 'Sparkline',
          props: { values: '1,2,3', statePath: null, label: 'Trend' },
          children: [],
        },
      },
      ['spark']
    )
    const error = hostCriticManifest(
      manifestWithHome(spec, { actions: { load: { apiKey: 'fetch' } } })
    )
    expect(error).toContain('Sparkline "spark"')
  })

  it('rejects a Card nested inside another Card', () => {
    const spec = pageSpec(
      {
        outer: { type: 'Card', props: cardProps, children: ['inner'] },
        inner: { type: 'Card', props: { ...cardProps, title: 'Inner' }, children: [] },
      },
      ['outer']
    )
    const error = hostCriticManifest(manifestWithHome(spec))
    expect(error).toContain('Card "inner"')
    expect(error).toContain('nested inside another Card')
  })

  it('allows Repeat of Cards', () => {
    const spec = pageSpec(
      {
        grid: { type: 'Grid', props: { columns: '2', gap: '16px' }, children: ['repeat'] },
        repeat: {
          type: 'Repeat',
          props: { statePath: 'items', emptyText: 'None' },
          children: ['item'],
        },
        item: { type: 'Card', props: cardProps, children: [] },
      },
      ['grid']
    )
    expect(hostCriticManifest(manifestWithHome(spec))).toBeUndefined()
  })

  it('rejects two primary actions in the same Section', () => {
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
    const error = hostCriticManifest(manifestWithHome(spec))
    expect(error).toContain('more than one primary action')
    expect(error).toContain('search')
    expect(error).toContain('go')
  })

  it(`rejects more than ${MAX_NON_REPEAT_CARDS_PER_PAGE} Cards outside Repeat`, () => {
    const ids = Array.from(
      { length: MAX_NON_REPEAT_CARDS_PER_PAGE + 1 },
      (_, index) => `card_${index}`
    )
    const cards: Spec['elements'] = {}
    for (const id of ids) {
      cards[id] = { type: 'Card', props: { ...cardProps, title: id }, children: [] }
    }
    const spec = pageSpec(
      {
        grid: { type: 'Grid', props: { columns: '3', gap: '16px' }, children: ids },
        ...cards,
      },
      ['grid']
    )
    const error = hostCriticManifest(manifestWithHome(spec))
    expect(error).toContain(`${MAX_NON_REPEAT_CARDS_PER_PAGE + 1} Cards outside Repeat`)
  })

  it('rejects an onSuccess.navigate target with no way back', () => {
    const resultsSpec = pageSpec(
      {
        heading: {
          type: 'Heading',
          props: { text: 'Score', level: 'h1', color: null },
          children: [],
        },
      },
      ['heading']
    )
    const error = hostCriticManifest({
      entryPath: 'home',
      pages: {
        home: twoPageManifest.pages.home,
        results: { path: 'results', title: 'Score', spec: resultsSpec },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
      },
    })
    expect(error).toContain('Page "results"')
    expect(error).toContain('onSuccess.navigate target')
    expect(error).toContain('Back')
  })

  it('skips defects on pages a scoped edit did not author', () => {
    const resultsSpec = pageSpec(
      {
        heading: {
          type: 'Heading',
          props: { text: 'Score', level: 'h1', color: null },
          children: [],
        },
      },
      ['heading']
    )
    const manifest: ArenaGenerativeAppManifest = {
      entryPath: 'home',
      pages: {
        home: twoPageManifest.pages.home,
        results: { path: 'results', title: 'Score', spec: resultsSpec },
      },
      actions: {
        submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
      },
    }
    expect(hostCriticManifest(manifest, { authoredPagePaths: ['home'] })).toBeUndefined()
    expect(hostCriticManifest(manifest, { authoredPagePaths: ['results'] })).toContain(
      'Page "results"'
    )
  })
})

describe('compactManifestForCritic', () => {
  it('keeps wiring props and drops the rest', () => {
    const compact = compactManifestForCritic(twoPageManifest)
    expect(compact.entryPath).toBe('home')
    expect(compact.pages.map((page) => page.path)).toEqual(['home', 'results'])
    const submit = compact.pages[0]?.elements.find((element) => element.id === 'submit')
    expect(submit?.props).toEqual({ label: 'Submit' })
    const form = compact.pages[0]?.elements.find((element) => element.id === 'form')
    expect(form?.props).toEqual({ actionId: 'submit_lead' })
    expect(JSON.stringify(compact)).not.toContain('Qualify a lead')
    for (const key of ['actionId', 'navigateTo', 'statePath', 'label'] as const) {
      expect(CRITIC_ELEMENT_PROP_KEYS).toContain(key)
    }
  })

  it('omits unauthored pages from a scoped compact view', () => {
    const compact = compactManifestForCritic(twoPageManifest, ['results'])
    expect(compact.pages.map((page) => page.path)).toEqual(['results'])
  })
})
