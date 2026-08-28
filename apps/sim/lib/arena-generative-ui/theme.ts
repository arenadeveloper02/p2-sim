import type { CSSProperties } from 'react'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
/** Arena DS radius: sm 8 · component 12 · lg 16. */
const RADIUS_PX = { sm: '8px', md: '12px', lg: '16px' } as const

/** Comfortable defaults; compact / roomy overlay `--gui-space-*` on the themed root. */
const DENSITY_SPACE = {
  compact: { md: '12px', lg: '16px', xl: '24px', '2xl': '32px' },
  comfortable: { md: '16px', lg: '24px', xl: '32px', '2xl': '48px' },
  roomy: { md: '24px', lg: '32px', xl: '40px', '2xl': '56px' },
} as const

export const ARENA_GENERATIVE_SPACING_TOKENS = [
  'none',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
] as const

export type ArenaGenerativeSpacingToken = (typeof ARENA_GENERATIVE_SPACING_TOKENS)[number]

/**
 * Catalog `gap` / `padding` tokens. Resolved to density-aware `--gui-space-*` so a
 * later theme density change still applies. CSS lengths pass through.
 */
const SPACING_TOKEN_CSS: Record<ArenaGenerativeSpacingToken, string> = {
  none: '0px',
  xs: 'var(--gui-space-xs, 4px)',
  sm: 'var(--gui-space-sm, 8px)',
  md: 'var(--gui-space-md, 16px)',
  lg: 'var(--gui-space-lg, 24px)',
  xl: 'var(--gui-space-xl, 32px)',
  '2xl': 'var(--gui-space-2xl, 48px)',
}

export function isArenaGenerativeSpacingToken(value: string): value is ArenaGenerativeSpacingToken {
  return (ARENA_GENERATIVE_SPACING_TOKENS as readonly string[]).includes(value)
}

/** Maps `lg` → `var(--gui-space-lg, 24px)`; leaves `"18px"` and CSS vars unchanged. */
export function resolveArenaGenerativeSpacing(value: string): string {
  return isArenaGenerativeSpacingToken(value) ? SPACING_TOKEN_CSS[value] : value
}

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
    const space = DENSITY_SPACE[theme.density]
    style['--gui-space-md'] = space.md
    style['--gui-space-lg'] = space.lg
    style['--gui-space-xl'] = space.xl
    style['--gui-space-2xl'] = space['2xl']
    style['--gui-gap'] = space.md
    style['--gui-pad'] = space.md
    style['--gui-section-gap'] = space.lg
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
