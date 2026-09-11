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
