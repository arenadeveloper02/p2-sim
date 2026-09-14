/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  carouselSlidesFromCollection,
  defaultCarouselSrcField,
  defaultCarouselTitleField,
} from '@/lib/arena-generative-ui/gui-carousel'
import {
  defaultFilmstripSubtitleField,
  defaultFilmstripTitleField,
  filmstripSlidesFromCollection,
} from '@/lib/arena-generative-ui/gui-filmstrip'
import { kanbanColumnsForCollection } from '@/lib/arena-generative-ui/gui-kanban'
import {
  defaultMapLatField,
  defaultMapLngField,
  defaultMapTitleField,
  mapMarkersForCollection,
  markerHasCoordinates,
  osmEmbedUrl,
  parseCoordinate,
} from '@/lib/arena-generative-ui/gui-map'
import {
  defaultTreeChildrenField,
  defaultTreeTitleField,
  treeNodesFromCollection,
} from '@/lib/arena-generative-ui/gui-tree'
import { timelineItemsForCollection } from '@/lib/arena-generative-ui/gui-timeline'
import { parseBreadcrumbItems } from '@/lib/arena-generative-ui/gui-breadcrumb'
import {
  commandPaletteEntriesFromCollection,
  filterCommandPaletteEntries,
  parseCommandPaletteItems,
} from '@/lib/arena-generative-ui/gui-command-palette'
import {
  paginationPageKey,
  parsePaginationMode,
  specHasPaginationControl,
} from '@/lib/arena-generative-ui/gui-pagination'

describe('gui-map', () => {
  it('discovers lat/lng/title keys and keeps rows without coordinates', () => {
    const items = [
      { name: 'HQ', latitude: '37.77', longitude: '-122.42' },
      { name: 'Remote' },
    ]
    expect(defaultMapLatField(items)).toBe('latitude')
    expect(defaultMapLngField(items)).toBe('longitude')
    expect(defaultMapTitleField(items, new Set(['latitude', 'longitude']))).toBe('name')
    const markers = mapMarkersForCollection(items, 'latitude', 'longitude', 'name')
    expect(markers[0]?.lat).toBe(37.77)
    expect(markerHasCoordinates(markers[0]!)).toBe(true)
    expect(markerHasCoordinates(markers[1]!)).toBe(false)
    expect(markers[1]?.title).toBe('Remote')
  })

  it('rejects out-of-range coordinates and builds an OSM embed URL', () => {
    expect(parseCoordinate(200, 'lat')).toBeUndefined()
    expect(parseCoordinate(-181, 'lng')).toBeUndefined()
    expect(osmEmbedUrl(37.77, -122.42)).toContain('openstreetmap.org/export/embed.html')
    expect(osmEmbedUrl(37.77, -122.42)).toContain('marker=')
  })
})

describe('gui-tree', () => {
  it('nests children and prefers name/title over the children key', () => {
    const items = [
      {
        name: 'Acme',
        children: [{ name: 'Design', children: [{ name: 'Brand' }] }],
      },
    ]
    expect(defaultTreeChildrenField(items)).toBe('children')
    expect(defaultTreeTitleField(items, 'children')).toBe('name')
    const nodes = treeNodesFromCollection(items, 'children', 'name')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.title).toBe('Acme')
    expect(nodes[0]?.children[0]?.title).toBe('Design')
    expect(nodes[0]?.children[0]?.children[0]?.title).toBe('Brand')
  })
})

describe('gui-timeline', () => {
  it('sorts dated rows oldest first and keeps undated at the end', () => {
    const items = [
      { title: 'Ship', date: '2026-09-18' },
      { title: 'Kickoff', date: '2026-09-11' },
      { title: 'Backlog' },
    ]
    const grouped = timelineItemsForCollection(items, 'date', 'title')
    expect(grouped.dated.map((entry) => entry.title)).toEqual(['Kickoff', 'Ship'])
    expect(grouped.undated.map((entry) => entry.title)).toEqual(['Backlog'])
  })
})

describe('gui-carousel', () => {
  it('reads src/title from records and treats string items as image URLs', () => {
    const records = [{ url: 'https://cdn.example/a.png', caption: 'A' }]
    expect(defaultCarouselSrcField(records)).toBe('url')
    expect(defaultCarouselTitleField(records, 'url')).toBe('caption')
    expect(carouselSlidesFromCollection(records, 'url', 'caption')[0]).toMatchObject({
      src: 'https://cdn.example/a.png',
      title: 'A',
    })
    expect(
      carouselSlidesFromCollection(['https://cdn.example/b.png'], 'src', 'title')[0]?.src
    ).toBe('https://cdn.example/b.png')
  })
})

describe('gui-kanban', () => {
  it('groups by status, honours column order, and parks empty status in Unassigned', () => {
    const items = [
      { title: 'Draft', status: 'Todo' },
      { title: 'Ship', status: 'Done' },
      { title: 'Backlog' },
    ]
    const lanes = kanbanColumnsForCollection(items, 'status', 'title', 'Todo,Doing,Done')
    expect(lanes.map((lane) => lane.id)).toEqual(['Todo', 'Doing', 'Done', 'Unassigned'])
    expect(lanes[0]?.cards.map((card) => card.title)).toEqual(['Draft'])
    expect(lanes[2]?.cards.map((card) => card.title)).toEqual(['Ship'])
    expect(lanes[3]?.cards.map((card) => card.title)).toEqual(['Backlog'])
  })
})

describe('gui-filmstrip', () => {
  it('uses time/title and a numeric subtitle when present', () => {
    const items = [{ time: '09:00', temperature_2m: 21 }]
    expect(defaultFilmstripTitleField(items)).toBe('time')
    expect(defaultFilmstripSubtitleField(items, 'time')).toBe('temperature_2m')
    expect(filmstripSlidesFromCollection(items, 'time', 'temperature_2m')[0]).toMatchObject({
      title: '09:00',
      subtitle: '21',
    })
  })
})

describe('gui-pagination', () => {
  it('keys local pages by statePath and detects authored Pagination', () => {
    expect(paginationPageKey('table', 'articles')).toBe('articles')
    expect(paginationPageKey('table', '', 2)).toBe('table:2')
    expect(parsePaginationMode(null, 'pages')).toBe('pages')
    expect(parsePaginationMode('more', 'pages')).toBe('more')
    expect(
      specHasPaginationControl(
        { pager: { type: 'Pagination', props: { statePath: 'articles' } } },
        'articles'
      )
    ).toBe(true)
    expect(
      specHasPaginationControl(
        { pager: { type: 'Pagination', props: { statePath: 'other' } } },
        'articles'
      )
    ).toBe(false)
  })
})

describe('gui-breadcrumb', () => {
  it('allows a current crumb without a path', () => {
    expect(parseBreadcrumbItems('Home|home\nOrders')).toEqual([
      { label: 'Home', path: 'home' },
      { label: 'Orders', path: null },
    ])
  })
})

describe('gui-command-palette', () => {
  it('parses navigate and action targets and filters by query', () => {
    const parsed = parseCommandPaletteItems('Home|home\nCreate|#create_task\nReload|action:refresh')
    expect(parsed).toEqual([
      { label: 'Home', kind: 'navigate', target: 'home' },
      { label: 'Create', kind: 'action', target: 'create_task' },
      { label: 'Reload', kind: 'action', target: 'refresh' },
    ])
    expect(filterCommandPaletteEntries(parsed, 'cre')).toEqual([parsed[1]])
    expect(
      commandPaletteEntriesFromCollection(
        [{ title: 'Open', path: 'detail' }],
        'title',
        'path',
        ''
      )
    ).toEqual([{ label: 'Open', kind: 'navigate', target: 'detail' }])
  })
})
