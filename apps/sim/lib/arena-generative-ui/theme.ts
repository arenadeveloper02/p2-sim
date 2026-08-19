import type { CSSProperties } from 'react'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
/** Arena DS radius: sm 8 · component 12 · lg 16. */
const RADIUS_PX = { sm: '8px', md: '12px', lg: '16px' } as const
const DENSITY_GAP = { compact: '12px', comfortable: '16px', roomy: '24px' } as const
const DENSITY_PAD = { compact: '12px', comfortable: '16px', roomy: '24px' } as const
const DENSITY_SECTION_GAP = { compact: '16px', comfortable: '24px', roomy: '32px' } as const

/** Arena brand blue — always the generate default unless Design Notes override. */
export const ARENA_GENERATIVE_BRAND_COLOR = '#1A73E8' as const

export const ARENA_GENERATIVE_THEME_RADII = ['sm', 'md', 'lg'] as const
export const ARENA_GENERATIVE_THEME_DENSITIES = ['compact', 'comfortable', 'roomy'] as const
export const ARENA_GENERATIVE_THEME_FONTS = ['sans', 'serif'] as const
export const ARENA_GENERATIVE_THEME_COLOR_SCHEMES = ['light', 'dark', 'system'] as const

export type ArenaGenerativeThemeRadius = (typeof ARENA_GENERATIVE_THEME_RADII)[number]
export type ArenaGenerativeThemeDensity = (typeof ARENA_GENERATIVE_THEME_DENSITIES)[number]
export type ArenaGenerativeThemeFont = (typeof ARENA_GENERATIVE_THEME_FONTS)[number]
export type ArenaGenerativeThemeColorScheme = (typeof ARENA_GENERATIVE_THEME_COLOR_SCHEMES)[number]

export interface ArenaGenerativeTheme {
  brandColor?: string
  radius?: ArenaGenerativeThemeRadius
  density?: ArenaGenerativeThemeDensity
  font?: ArenaGenerativeThemeFont
  colorScheme?: ArenaGenerativeThemeColorScheme
}

export const DEFAULT_ARENA_GENERATIVE_THEME: ArenaGenerativeTheme = {
  brandColor: ARENA_GENERATIVE_BRAND_COLOR,
  radius: 'md',
  density: 'comfortable',
  font: 'sans',
  colorScheme: 'light',
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

/**
 * Normalizes a generated `manifest.theme`. Invalid values are dropped so a
 * typo cannot fail validation — branding just falls back to host defaults.
 */
export function parseArenaGenerativeTheme(raw: unknown): ArenaGenerativeTheme | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const theme: ArenaGenerativeTheme = {}
  if (typeof record.brandColor === 'string' && HEX_COLOR.test(record.brandColor.trim())) {
    theme.brandColor = record.brandColor.trim()
  }
  const radius = asEnum(record.radius, ARENA_GENERATIVE_THEME_RADII)
  if (radius) theme.radius = radius
  const density = asEnum(record.density, ARENA_GENERATIVE_THEME_DENSITIES)
  if (density) theme.density = density
  const font = asEnum(record.font, ARENA_GENERATIVE_THEME_FONTS)
  if (font) theme.font = font
  const colorScheme = asEnum(record.colorScheme, ARENA_GENERATIVE_THEME_COLOR_SCHEMES)
  if (colorScheme) theme.colorScheme = colorScheme
  return Object.keys(theme).length > 0 ? theme : undefined
}

/**
 * Inline CSS variables the host sets on the themed root. Catalog components
 * read `--gui-*`; omitted keys keep the stylesheet defaults.
 */
export function arenaGenerativeThemeStyle(theme?: ArenaGenerativeTheme): CSSProperties {
  if (!theme) return {}
  const style: Record<string, string> = {}
  if (theme.brandColor) {
    style['--gui-brand'] = theme.brandColor
    style['--gui-brand-hover'] = `color-mix(in srgb, ${theme.brandColor} 82%, #000)`
    style['--gui-brand-pressed'] = `color-mix(in srgb, ${theme.brandColor} 68%, #000)`
    style['--gui-brand-surface'] = `color-mix(in srgb, ${theme.brandColor} 10%, #fff)`
  }
  if (theme.radius) {
    style['--gui-radius'] = RADIUS_PX[theme.radius]
  }
  if (theme.density) {
    style['--gui-gap'] = DENSITY_GAP[theme.density]
    style['--gui-pad'] = DENSITY_PAD[theme.density]
    style['--gui-section-gap'] = DENSITY_SECTION_GAP[theme.density]
  }
  if (theme.font === 'serif') {
    style.fontFamily = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
  }
  return style as CSSProperties
}

export function arenaGenerativeThemeScheme(
  theme?: ArenaGenerativeTheme
): ArenaGenerativeThemeColorScheme {
  return theme?.colorScheme ?? 'light'
}
