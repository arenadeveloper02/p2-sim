/**
 * Geographic pins for the GUI host Map widget. Parses lat/lng without a map SDK.
 */

const LAT_KEYS = ['lat', 'latitude', 'y'] as const
const LNG_KEYS = ['lng', 'lon', 'longitude', 'x'] as const
const TITLE_KEYS = ['title', 'name', 'label', 'place', 'address', 'city'] as const
const ADDRESS_KEYS = ['address', 'location', 'city', 'place'] as const

export interface MapMarker {
  item: unknown
  index: number
  title: string
  lat?: number
  lng?: number
  address?: string
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function parseCoordinate(value: unknown, kind: 'lat' | 'lng'): number | undefined {
  let numeric: number | undefined
  if (typeof value === 'number' && Number.isFinite(value)) numeric = value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) numeric = parsed
  }
  if (numeric === undefined) return undefined
  if (kind === 'lat' && (numeric < -90 || numeric > 90)) return undefined
  if (kind === 'lng' && (numeric < -180 || numeric > 180)) return undefined
  return numeric
}

function firstMatchingKey(
  items: readonly unknown[],
  keys: readonly string[],
  accept: (value: unknown) => boolean
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of keys) {
      if (accept(record[key])) return key
    }
  }
  return keys[0] ?? ''
}

export function defaultMapLatField(items: readonly unknown[]): string {
  return firstMatchingKey(items, LAT_KEYS, (value) => parseCoordinate(value, 'lat') !== undefined)
}

export function defaultMapLngField(items: readonly unknown[]): string {
  return firstMatchingKey(items, LNG_KEYS, (value) => parseCoordinate(value, 'lng') !== undefined)
}

export function defaultMapTitleField(
  items: readonly unknown[],
  skip: ReadonlySet<string>
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of TITLE_KEYS) {
      if (skip.has(key)) continue
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return key
    }
  }
  return 'title'
}

function addressFromRecord(record: Record<string, unknown> | undefined, titleField: string): string | undefined {
  if (!record) return undefined
  for (const key of ADDRESS_KEYS) {
    if (key === titleField) continue
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function mapMarkersForCollection(
  items: readonly unknown[],
  latField: string,
  lngField: string,
  titleField: string
): MapMarker[] {
  return items.map((item, index) => {
    const record = recordFromUnknown(item)
    const titleRaw = record?.[titleField]
    const title =
      typeof titleRaw === 'string' && titleRaw.trim()
        ? titleRaw.trim()
        : typeof record?.name === 'string'
          ? record.name
          : `Item ${index + 1}`
    return {
      item,
      index,
      title,
      lat: parseCoordinate(record?.[latField], 'lat'),
      lng: parseCoordinate(record?.[lngField], 'lng'),
      address: addressFromRecord(record, titleField),
    }
  })
}

/**
 * OpenStreetMap embed centered on one pin. Multi-pin maps keep a host list;
 * the iframe shows the selected (or first located) marker.
 */
export function osmEmbedUrl(lat: number, lng: number, span = 0.04): string {
  const bbox = `${lng - span},${lat - span},${lng + span},${lat + span}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
}

export function markerHasCoordinates(marker: MapMarker): boolean {
  return marker.lat !== undefined && marker.lng !== undefined
}
