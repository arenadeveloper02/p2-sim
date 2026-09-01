/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatVisualBriefForGenerator,
  formatVisualBriefForPlanner,
  formatVisualBriefMatchNotes,
  MATCH_SCREENSHOT_USER_INPUT,
  packStoredStructuredBrief,
  parseArenaGenerativeVisualBrief,
  parseStoredVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'

const validBrief = {
  screens: [
    {
      title: 'Orders',
      inferredPath: 'home',
      purpose: 'Browse the order inbox',
      archetype: 'collection',
      representation: 'table',
      regions: [{ region: 'primary', purpose: 'Order table', archetype: 'collection' }],
      visibleCopy: ['Orders', 'Open'],
      fields: [{ name: 'query', label: 'Search', type: 'text' }],
      ctas: ['Search'],
    },
  ],
  layout: {
    shell: 'minimal',
    density: 'compact',
    colorScheme: 'light',
    visualTone: 'professional',
    brandColor: '#1a73e8',
  },
  catalogMapping: [{ observed: 'data grid', catalogType: 'Table' }],
  unrepresentable: [
    {
      observed: 'custom kanban board',
      closestCatalogType: 'Table',
      reason: 'No kanban catalog type',
    },
  ],
}

describe('parseArenaGenerativeVisualBrief', () => {
  it('accepts a valid visual brief and normalizes brandColor', () => {
    const parsed = parseArenaGenerativeVisualBrief(validBrief)
    expect(parsed?.screens[0]?.inferredPath).toBe('home')
    expect(parsed?.layout.brandColor).toBe('#1A73E8')
    expect(parsed?.catalogMapping[0]?.catalogType).toBe('Table')
  })

  it('drops catalog mappings that are not catalog types', () => {
    const parsed = parseArenaGenerativeVisualBrief({
      ...validBrief,
      catalogMapping: [
        { observed: 'grid', catalogType: 'Table' },
        { observed: 'kanban', catalogType: 'KanbanBoard' },
      ],
    })
    expect(parsed?.catalogMapping.map((item) => item.catalogType)).toEqual(['Table'])
  })

  it('rejects an empty screens list', () => {
    expect(parseArenaGenerativeVisualBrief({ ...validBrief, screens: [] })).toBeNull()
  })
})

describe('parseStoredVisualBrief', () => {
  it('reads a nested visualBrief on stored jsonb', () => {
    expect(parseStoredVisualBrief({ title: 'Orders', visualBrief: validBrief })?.screens).toHaveLength(
      1
    )
  })

  it('returns null when none was stored', () => {
    expect(parseStoredVisualBrief({ title: 'Orders' })).toBeNull()
    expect(parseStoredVisualBrief(null)).toBeNull()
  })
})

describe('packStoredStructuredBrief', () => {
  it('nests the visual brief beside planner fields', () => {
    const packed = packStoredStructuredBrief({ title: 'Orders', archetype: 'collection' }, {
      screens: validBrief.screens,
      layout: validBrief.layout,
      catalogMapping: [],
      unrepresentable: [],
    } as never)
    expect(packed?.title).toBe('Orders')
    expect(parseStoredVisualBrief(packed)?.screens[0]?.title).toBe('Orders')
  })
})

describe('visual brief formatters', () => {
  it('marks screenshot structure as explicit for the planner', () => {
    const parsed = parseArenaGenerativeVisualBrief(validBrief)
    expect(parsed).not.toBeNull()
    const text = formatVisualBriefForPlanner(parsed!)
    expect(text).toContain('explicit requirements')
    expect(text).toContain('Orders')
  })

  it('tells the generator to use theme knobs from the screenshot', () => {
    const parsed = parseArenaGenerativeVisualBrief(validBrief)
    const text = formatVisualBriefForGenerator(parsed!)
    expect(text).toContain('brandColor #1A73E8')
    expect(text).toContain('catalogMapping')
  })

  it('formats catalog gaps for preview', () => {
    const parsed = parseArenaGenerativeVisualBrief(validBrief)
    expect(formatVisualBriefMatchNotes(parsed!)).toContain('custom kanban board → Table')
    expect(MATCH_SCREENSHOT_USER_INPUT).toContain('matches the uploaded screenshot')
  })
})
