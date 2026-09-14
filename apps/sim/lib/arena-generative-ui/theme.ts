import type { CSSProperties } from 'react'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
/** Arena DS radius: sm 8 · component 12 · lg 16. Inner chrome steps one token down. */
const RADIUS_PX = { sm: '8px', md: '12px', lg: '16px' } as const
const RADIUS_SM_PX = { sm: '4px', md: '8px', lg: '12px' } as const

/** Comfortable defaults; compact / roomy overlay `--gui-space-*` on the themed root. */
const DENSITY_SPACE = {
  compact: { xs: '2px', sm: '6px', md: '12px', lg: '16px', xl: '24px', '2xl': '32px' },
  comfortable: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', '2xl': '48px' },
  roomy: { xs: '6px', sm: '12px', md: '24px', lg: '32px', xl: '40px', '2xl': '56px' },
} as const

const DENSITY_TYPE = {
  compact: {
    controlHeight: '36px',
    controlPx: '12px',
    displaySize: '32px',
    displayLeading: '40px',
    headingSize: '28px',
    headingLeading: '36px',
    titleSize: '20px',
    titleLeading: '28px',
    statSize: '32px',
    statLeading: '40px',
    bodySize: '14px',
    bodyLeading: '20px',
    labelSize: '11px',
    labelLeading: '14px',
  },
  comfortable: {
    controlHeight: '40px',
    controlPx: '16px',
    displaySize: '40px',
    displayLeading: '48px',
    headingSize: '32px',
    headingLeading: '40px',
    titleSize: '24px',
    titleLeading: '32px',
    statSize: '40px',
    statLeading: '48px',
    bodySize: '16px',
    bodyLeading: '24px',
    labelSize: '12px',
    labelLeading: '16px',
  },
  roomy: {
    controlHeight: '44px',
    controlPx: '18px',
    displaySize: '44px',
    displayLeading: '52px',
    headingSize: '36px',
    headingLeading: '44px',
    titleSize: '28px',
    titleLeading: '36px',
    statSize: '44px',
    statLeading: '52px',
    bodySize: '16px',
    bodyLeading: '26px',
    labelSize: '13px',
    labelLeading: '18px',
  },
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
export const ARENA_GENERATIVE_THEME_INKS = ['default', 'strong'] as const
export const ARENA_GENERATIVE_THEME_LOADING_CHROMES = ['skeleton', 'spinner'] as const

export type ArenaGenerativeThemeRadius = (typeof ARENA_GENERATIVE_THEME_RADII)[number]
export type ArenaGenerativeThemeDensity = (typeof ARENA_GENERATIVE_THEME_DENSITIES)[number]
export type ArenaGenerativeThemeFont = (typeof ARENA_GENERATIVE_THEME_FONTS)[number]
export type ArenaGenerativeThemeColorScheme = (typeof ARENA_GENERATIVE_THEME_COLOR_SCHEMES)[number]
export type ArenaGenerativeThemeInk = (typeof ARENA_GENERATIVE_THEME_INKS)[number]
export type ArenaGenerativeThemeLoadingChrome =
  (typeof ARENA_GENERATIVE_THEME_LOADING_CHROMES)[number]

export interface ArenaGenerativeTheme {
  brandColor?: string
  radius?: ArenaGenerativeThemeRadius
  density?: ArenaGenerativeThemeDensity
  font?: ArenaGenerativeThemeFont
  colorScheme?: ArenaGenerativeThemeColorScheme
  /** Stronger body/muted ink. App-wide — not a per-card hex. */
  ink?: ArenaGenerativeThemeInk
  /** Pending region chrome. Host paints this; do not emit spec Spinner. */
  loadingChrome?: ArenaGenerativeThemeLoadingChrome
}

export const DEFAULT_ARENA_GENERATIVE_THEME: ArenaGenerativeTheme = {
  brandColor: ARENA_GENERATIVE_BRAND_COLOR,
  radius: 'md',
  density: 'comfortable',
  font: 'sans',
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
  const ink = asEnum(record.ink, ARENA_GENERATIVE_THEME_INKS)
  if (ink) theme.ink = ink
  const loadingChrome = asEnum(record.loadingChrome, ARENA_GENERATIVE_THEME_LOADING_CHROMES)
  if (loadingChrome) theme.loadingChrome = loadingChrome
  return Object.keys(theme).length > 0 ? theme : undefined
}

export type ArenaGenerativeResolvedScheme = 'light' | 'dark'

const DEFAULT_BRAND_HEX = ARENA_GENERATIVE_BRAND_COLOR.toLowerCase()

function isDefaultArenaBrandColor(brandColor: string): boolean {
  return brandColor.trim().toLowerCase() === DEFAULT_BRAND_HEX
}

/**
 * Inline CSS variables the host sets on the themed root. Catalog components
 * read `--gui-*`; omitted keys keep the stylesheet defaults.
 *
 * Default Arena brand (`#1A73E8`) is not inlined so light/dark CSS tokens win.
 * Custom brands use scheme-aware mixes.
 */
export function arenaGenerativeThemeStyle(
  theme?: ArenaGenerativeTheme,
  scheme: ArenaGenerativeResolvedScheme = 'light'
): CSSProperties {
  if (!theme) return {}
  const style: Record<string, string> = {}
  if (theme.brandColor && !isDefaultArenaBrandColor(theme.brandColor)) {
    const brand = theme.brandColor
    style['--gui-brand'] = brand
    if (scheme === 'dark') {
      style['--gui-brand-hover'] = `color-mix(in srgb, ${brand} 82%, #fff)`
      style['--gui-brand-pressed'] = `color-mix(in srgb, ${brand} 68%, #fff)`
      style['--gui-brand-surface'] = `color-mix(in srgb, ${brand} 22%, #12141a)`
      style['--gui-focus'] = `color-mix(in srgb, ${brand} 40%, transparent)`
      style['--gui-text-on-brand'] = '#12141a'
    } else {
      style['--gui-brand-hover'] = `color-mix(in srgb, ${brand} 82%, #000)`
      style['--gui-brand-pressed'] = `color-mix(in srgb, ${brand} 68%, #000)`
      style['--gui-brand-surface'] = `color-mix(in srgb, ${brand} 10%, #fff)`
      style['--gui-focus'] = `color-mix(in srgb, ${brand} 30%, transparent)`
      style['--gui-text-on-brand'] = '#ffffff'
    }
  }
  if (theme.radius) {
    style['--gui-radius'] = RADIUS_PX[theme.radius]
    style['--gui-radius-sm'] = RADIUS_SM_PX[theme.radius]
  }
  if (theme.density) {
    const space = DENSITY_SPACE[theme.density]
    const type = DENSITY_TYPE[theme.density]
    style['--gui-space-xs'] = space.xs
    style['--gui-space-sm'] = space.sm
    style['--gui-space-md'] = space.md
    style['--gui-space-lg'] = space.lg
    style['--gui-space-xl'] = space.xl
    style['--gui-space-2xl'] = space['2xl']
    style['--gui-gap'] = space.md
    style['--gui-pad'] = space.md
    style['--gui-section-gap'] = space.lg
    style['--gui-control-height'] = type.controlHeight
    style['--gui-control-px'] = type.controlPx
    style['--gui-display-size'] = type.displaySize
    style['--gui-display-leading'] = type.displayLeading
    style['--gui-heading-size'] = type.headingSize
    style['--gui-heading-leading'] = type.headingLeading
    style['--gui-title-size'] = type.titleSize
    style['--gui-title-leading'] = type.titleLeading
    style['--gui-stat-size'] = type.statSize
    style['--gui-stat-leading'] = type.statLeading
    style['--gui-body-size'] = type.bodySize
    style['--gui-body-leading'] = type.bodyLeading
    style['--gui-label-size'] = type.labelSize
    style['--gui-label-leading'] = type.labelLeading
  }
  if (theme.font === 'serif') {
    style.fontFamily = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
  }
  if (theme.ink === 'strong') {
    if (scheme === 'dark') {
      style['--gui-text'] = '#f4f5f7'
      style['--gui-text-muted'] = '#d0d3db'
    } else {
      style['--gui-text'] = '#1a1b1f'
      style['--gui-text-muted'] = '#3d3f47'
    }
  }
  return style as CSSProperties
}

export function arenaGenerativeThemeScheme(
  theme?: ArenaGenerativeTheme
): ArenaGenerativeThemeColorScheme {
  return theme?.colorScheme ?? 'light'
}
