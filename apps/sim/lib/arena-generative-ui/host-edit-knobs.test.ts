/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyHostEditKnobs,
  applySplitResultsBack,
  hostEditLandMisses,
  isPaintOnlyEdit,
  parseHostEditKnobs,
  parseSplitResultsAsk,
} from '@/lib/arena-generative-ui/host-edit-knobs'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

function cardListManifest(): ArenaGenerativeAppManifest {
  return {
    entryPath: 'history',
    pages: {
      history: {
        title: 'History',
        path: 'history',
        spec: {
          root: 'page',
          elements: {
            page: { type: 'Page', props: {}, children: ['section'] },
            section: { type: 'Section', props: {}, children: ['heading', 'stack'] },
            heading: { type: 'Heading', props: { text: 'Runs', level: 'h1' }, children: [] },
            stack: { type: 'Stack', props: { direction: 'vertical' }, children: ['repeat'] },
            repeat: {
              type: 'Repeat',
              props: { statePath: 'history', emptyText: 'No runs' },
              children: ['card'],
            },
            card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
          },
        },
      },
    },
    actions: {},
  }
}

describe('parseHostEditKnobs', () => {
  it('reads two cards per row and a page hint', () => {
    expect(parseHostEditKnobs('On the "history" page, show two cards in a row.')).toEqual({
      collectionDensity: { columns: '2', pageHint: 'history' },
    })
  })

  it('maps pixel card width to columns 2 as nearest', () => {
    expect(parseHostEditKnobs('Make the cards 327px wide.')).toEqual({
      collectionDensity: { columns: '2', pageHint: undefined, nearestFromPixels: true },
    })
  })

  it('reads darker text, circular loader, and title size', () => {
    const knobs = parseHostEditKnobs(
      'The title is too big — use a normal size. Make the text a bit darker. Don’t show the skeleton, use a circular loader.'
    )
    expect(knobs.headingScale).toBe('smaller')
    expect(knobs.textContrast).toBe('strong')
    expect(knobs.loadingChrome).toBe('spinner')
  })

  it('reads hide empty while fetching', () => {
    expect(
      parseHostEditKnobs('Hide that no results section shown while fetching the data.')
        .emptyWhilePending
    ).toBe(true)
  })
})

describe('isPaintOnlyEdit', () => {
  it('accepts ordinary-language paint knobs', () => {
    expect(isPaintOnlyEdit('Show two history cards in a row.', null)).toBe(true)
    expect(isPaintOnlyEdit('Make the text a bit darker.', null)).toBe(true)
  })

  it('rejects sitemap or binding edits', () => {
    expect(
      isPaintOnlyEdit(
        'Move results to a separate page titled "Requested info" and add a Back button.',
        null
      )
    ).toBe(false)
  })
})

describe('applyHostEditKnobs', () => {
  it('wraps Repeat in Grid columns 2', () => {
    const result = applyHostEditKnobs(cardListManifest(), {
      collectionDensity: { columns: '2', pageHint: 'history' },
    })
    const elements = result.manifest.pages.history.spec.elements as Record<
      string,
      { type?: string; props?: Record<string, unknown>; children?: string[] }
    >
    const parent = Object.values(elements).find((element) =>
      (element.children ?? []).includes('repeat')
    )
    expect(parent?.type).toBe('Grid')
    expect(parent?.props?.columns).toBe('2')
    expect(result.adoptedChanges[0]?.code).toBe('collection-density')
    expect(hostEditLandMisses(result.manifest, 'two cards in a row on history')).toEqual([])
  })

  it('demotes Heading h1 and sets theme ink and spinner', () => {
    const result = applyHostEditKnobs(cardListManifest(), {
      headingScale: 'smaller',
      textContrast: 'strong',
      loadingChrome: 'spinner',
    })
    const heading = result.manifest.pages.history.spec.elements as Record<
      string,
      { props?: Record<string, unknown> }
    >
    expect(heading.heading?.props?.level).toBe('h2')
    expect(result.manifest.theme?.ink).toBe('strong')
    expect(result.manifest.theme?.loadingChrome).toBe('spinner')
  })
})

describe('parseSplitResultsAsk', () => {
  it('reads a titled destination', () => {
    expect(
      parseSplitResultsAsk(
        'Results are on the same page. Move them to a separate page titled "Requested info".'
      )
    ).toEqual({ title: 'Requested info', path: 'requested-info' })
  })
})

describe('applySplitResultsBack', () => {
  it('inserts Back to the entry page when the destination has none', () => {
    const withoutBack: ArenaGenerativeAppManifest = structuredClone(twoPageManifest)
    const elements = withoutBack.pages.results.spec.elements as Record<
      string,
      { type?: string; children?: string[] }
    >
    delete elements.back
    elements.section = {
      ...elements.section,
      children: (elements.section.children ?? []).filter((id) => id !== 'back'),
    }
    const result = applySplitResultsBack(
      withoutBack,
      'Move results to a separate page titled "Score". Add a Back CTA.'
    )
    const next = result.manifest.pages.results.spec.elements as Record<
      string,
      { type?: string; props?: Record<string, unknown> }
    >
    const back = Object.values(next).find(
      (element) => element.type === 'NavLink' && element.props?.to === 'home'
    )
    expect(back).toBeTruthy()
    expect(result.adoptedChanges[0]?.code).toBe('split-results-back')
  })
})
