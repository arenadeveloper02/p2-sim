/**
 * Closed Icon / AppHeader / EmptyState glyph names, plus WMO weather_code
 * mapping so a bound numeric condition can paint a catalog icon.
 */

export const ARENA_GENERATIVE_CATALOG_ICON_NAMES = [
  'search',
  'file',
  'chart',
  'shield',
  'building',
  'check',
  'spark',
  'users',
  'globe',
  'message',
  'link',
  'inbox',
  'calendar',
  'star',
  'trend',
  'plus',
  'pencil',
  'trash',
  'download',
  'copy',
  'filter',
  'upload',
  'settings',
  'more',
  'sun',
  'moon',
  'cloud',
  'cloud-sun',
  'cloud-rain',
  'cloud-snow',
  'cloud-lightning',
  'wind',
  'droplet',
  'thermometer',
] as const

export type ArenaGenerativeCatalogIconName =
  (typeof ARENA_GENERATIVE_CATALOG_ICON_NAMES)[number]

const ICON_NAME_SET = new Set<string>(ARENA_GENERATIVE_CATALOG_ICON_NAMES)

export const SEARCH_LIVE_DEBOUNCE_MS = 280
export const SEARCH_LIVE_MIN_CHARS = 2

export function isArenaGenerativeCatalogIconName(
  value: string
): value is ArenaGenerativeCatalogIconName {
  return ICON_NAME_SET.has(value)
}

/**
 * Open-Meteo / WMO synop weather interpretation codes → catalog Icon.name.
 */
export function catalogIconFromWeatherCode(code: number): ArenaGenerativeCatalogIconName {
  if (code === 0) return 'sun'
  if (code >= 1 && code <= 2) return 'cloud-sun'
  if (code === 3) return 'cloud'
  if (code >= 45 && code <= 48) return 'cloud'
  if (code >= 51 && code <= 67) return 'cloud-rain'
  if (code >= 71 && code <= 77) return 'cloud-snow'
  if (code >= 80 && code <= 82) return 'cloud-rain'
  if (code >= 85 && code <= 86) return 'cloud-snow'
  if (code >= 95 && code <= 99) return 'cloud-lightning'
  return 'cloud'
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Resolves a catalog icon from a static name or bound state (icon name string
 * or numeric WMO weather_code).
 */
export function resolveCatalogIconName(options: {
  name?: string
  bound?: unknown
}): ArenaGenerativeCatalogIconName {
  const named = options.name?.trim() ?? ''
  if (named && isArenaGenerativeCatalogIconName(named)) return named
  if (typeof options.bound === 'string') {
    const boundName = options.bound.trim()
    if (isArenaGenerativeCatalogIconName(boundName)) return boundName
  }
  const code = asFiniteNumber(options.bound)
  if (code !== undefined) return catalogIconFromWeatherCode(code)
  if (named) return 'spark'
  return 'spark'
}
