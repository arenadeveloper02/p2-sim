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

  it('unwraps grouping Cards around Repeat item Cards', () => {
    const spec = pageSpec(
      {
        locations_card: {
          type: 'Card',
          props: { title: 'Saved locations', variant: 'default' },
          children: ['locations_repeat'],
        },
        locations_repeat: {
          type: 'Repeat',
          props: { statePath: 'locations', emptyText: 'None' },
          children: ['location_item_card'],
        },
        location_item_card: {
          type: 'Card',
          props: { title: '{item.name}', variant: 'default' },
          children: [],
        },
        daily_card: {
          type: 'Card',
          props: { title: '7-day forecast', variant: 'default' },
          children: ['daily_repeat'],
        },
        daily_repeat: {
          type: 'Repeat',
          props: { statePath: 'daily', emptyText: 'None' },
          children: ['daily_item_card'],
        },
        daily_item_card: {
          type: 'Card',
          props: { title: '{item.time}', variant: 'default' },
          children: [],
        },
      },
      ['locations_card', 'daily_card']
    )
    const manifest = manifestWithHome(spec)
    expect(hostCriticManifest(manifest)).toContain('nested inside another Card')

    const result = repairHostCriticExtras(manifest)
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.locations_card?.type).toBe('Stack')
    expect(result.manifest.pages.home.spec.elements.daily_card?.type).toBe('Stack')
    expect(result.manifest.pages.home.spec.elements.location_item_card?.type).toBe('Card')
    expect(result.manifest.pages.home.spec.elements.daily_item_card?.type).toBe('Card')
    expect(result.manifest.pages.home.spec.elements.locations_card_heading?.props).toMatchObject({
      text: 'Saved locations',
      level: 'h2',
    })
    expect(result.adoptedChanges.some((change) => change.code === 'nested-card')).toBe(true)
  })

  it('unwraps three nested Cards down to one item Card', () => {
    const spec = pageSpec(
      {
        outer: { type: 'Card', props: { title: 'Outer' }, children: ['mid'] },
        mid: { type: 'Card', props: { title: 'Mid' }, children: ['inner'] },
        inner: { type: 'Card', props: { title: 'Inner' }, children: [] },
      },
      ['outer']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.outer?.type).toBe('Stack')
    expect(result.manifest.pages.home.spec.elements.mid?.type).toBe('Stack')
    expect(result.manifest.pages.home.spec.elements.inner?.type).toBe('Card')
  })

  it('drops hard-coded Stats when the app has bindings', () => {
    const spec = pageSpec(
      {
        temp: {
          type: 'Stat',
          props: { label: 'Temp', value: '21', statePath: null },
          children: [],
        },
      },
      ['temp']
    )
    const manifest: ArenaGenerativeAppManifest = {
      ...manifestWithHome(spec),
      actions: { load: { apiKey: 'forecast' } },
    }
    expect(hostCriticManifest(manifest)).toContain('Bind the metric')

    const result = repairHostCriticExtras(manifest)
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.temp).toBeUndefined()
    expect(result.adoptedChanges.some((change) => change.code === 'unbound-metric')).toBe(true)
  })

  it('keeps Pagination and CommandPalette as catalog types', () => {
    const spec = pageSpec(
      {
        pager: { type: 'Pagination', props: { statePath: 'projects' }, children: [] },
        palette: {
          type: 'CommandPalette',
          props: { items: 'Home|home' },
          children: [],
        },
      },
      ['pager', 'palette']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.pager?.type).toBe('Pagination')
    expect(result.manifest.pages.home.spec.elements.palette?.type).toBe('CommandPalette')
    expect(result.adoptedChanges.some((change) => change.code === 'invented-type')).toBe(false)
  })

  it('keeps Kanban and Filmstrip as catalog types', () => {
    const spec = pageSpec(
      {
        board: { type: 'Kanban', props: { statePath: 'projects' }, children: [] },
        hours: {
          type: 'Filmstrip',
          props: { statePath: 'hourly', titleField: 'time', subtitleField: 'temperature_2m' },
          children: [],
        },
      },
      ['board', 'hours']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.board?.type).toBe('Kanban')
    expect(result.manifest.pages.home.spec.elements.hours?.type).toBe('Filmstrip')
    expect(result.adoptedChanges.some((change) => change.code === 'invented-type')).toBe(false)
  })

  it('unwraps overflow Cards outside Repeat', () => {
    const cards: Spec['elements'] = {}
    const ids: string[] = []
    for (let index = 0; index < 9; index += 1) {
      const id = `card_${index}`
      ids.push(id)
      cards[id] = { type: 'Card', props: { title: id }, children: [] }
    }
    const spec = pageSpec(
      {
        grid: { type: 'Grid', props: { columns: '3' }, children: ids },
        ...cards,
      },
      ['grid']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.card_8?.type).toBe('Stack')
    expect(result.adoptedChanges.some((change) => change.code === 'collection-cards')).toBe(true)
  })

  it('injects Back on an onSuccess.navigate target', () => {
    const resultsSpec = pageSpec(
      {
        heading: {
          type: 'Heading',
          props: { text: 'Score', level: 'h2', color: null },
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
    expect(hostCriticManifest(manifest)).toContain('no NavLink')

    const result = repairHostCriticExtras(manifest)
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.results.spec.elements.back?.props).toMatchObject({
      navigateTo: 'home',
      variant: 'ghost',
    })
    expect(result.adoptedChanges.some((change) => change.code === 'missing-back')).toBe(true)
  })

  it('unwraps nested Workspace and short shells to Stack', () => {
    const spec = pageSpec(
      {
        shell: {
          type: 'Workspace',
          props: { inspectorWhen: null, gap: 'lg', showWhen: null },
          children: ['nav'],
        },
        nav: {
          type: 'Workspace',
          props: { inspectorWhen: null, gap: 'lg', showWhen: null },
          children: [],
        },
      },
      ['shell']
    )
    const result = repairHostCriticExtras(manifestWithHome(spec))
    expect(hostCriticManifest(result.manifest)).toBeUndefined()
    expect(result.manifest.pages.home.spec.elements.shell?.type).toBe('Stack')
    expect(result.manifest.pages.home.spec.elements.nav?.type).toBe('Stack')
    expect(result.adoptedChanges.some((change) => change.code === 'workspace-shell')).toBe(true)
  })
})
