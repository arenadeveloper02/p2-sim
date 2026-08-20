import type { ArenaGenerativeEditScope } from '@/lib/arena-generative-ui/edit-scope'
import {
  type ArenaGenerativeTheme,
  DEFAULT_ARENA_GENERATIVE_THEME,
  parseArenaGenerativeTheme,
} from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

const HEX_COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/
const LAYOUT_HINT =
  /\b(page|pages|layout|button|form|title|copy|nav|tab|card|table|field|cta|search|header|add|remove|move|center|centre|rewrite)\b/i
const THEME_HINT =
  /\b(theme|brand(?:\s*colou?r)?|density|radius|typeface|font|dark\s*mode|light\s*mode|color\s*scheme|colorScheme|compact|comfortable|roomy)\b/i

/**
 * True when the change is only branding tokens. Theme edits skip the manifest LLM.
 */
export function isThemeOnlyEdit(
  instructions: string,
  scope: ArenaGenerativeEditScope | null
): boolean {
  const text = instructions.trim()
  if (!text) return false
  if (scope) {
    if (!scope.touchesTheme || scope.touchesActions || !scope.pageSetStable) return false
    if (scope.mode === 'pages' && scope.pages.length > 0) return false
  }
  if (LAYOUT_HINT.test(text)) return false
  return THEME_HINT.test(text) || Boolean(parseThemeHints(text).brandColor)
}

/**
 * Reads theme knobs from edit instructions or design notes.
 */
export function parseThemeHints(text: string): ArenaGenerativeTheme {
  const raw: Record<string, unknown> = {}
  const hex = text.match(HEX_COLOR)
  if (hex) raw.brandColor = hex[0]
  if (/\bcompact\b/i.test(text)) raw.density = 'compact'
  else if (/\broomy\b/i.test(text)) raw.density = 'roomy'
  else if (/\bcomfortable\b/i.test(text)) raw.density = 'comfortable'
  if (
    /\b(dark\s*mode|color\s*scheme\s*dark|colorScheme\s*dark)\b/i.test(text) &&
    !/\b(light\s*mode|colorScheme\s*light)\b/i.test(text)
  ) {
    raw.colorScheme = 'dark'
  } else if (/\b(light\s*mode|color\s*scheme\s*light|colorScheme\s*light)\b/i.test(text)) {
    raw.colorScheme = 'light'
  } else if (/\b(color\s*scheme\s*system|colorScheme\s*system)\b/i.test(text)) {
    raw.colorScheme = 'system'
  }
  if (/\b(radius\s*sm|small corners)\b/i.test(text)) raw.radius = 'sm'
  else if (/\b(radius\s*lg|large corners)\b/i.test(text)) raw.radius = 'lg'
  else if (/\b(radius\s*md)\b/i.test(text)) raw.radius = 'md'
  if (/\bserif\b/i.test(text)) raw.font = 'serif'
  else if (/\bsans\b/i.test(text)) raw.font = 'sans'
  return parseArenaGenerativeTheme(raw) ?? {}
}

/**
 * Overlays parsed hints onto the existing theme. Unmentioned knobs stay as they are.
 */
export function applyThemePatch(
  existing: ArenaGenerativeTheme | undefined,
  instructions: string,
  designNotes?: string
): ArenaGenerativeTheme {
  const base = { ...DEFAULT_ARENA_GENERATIVE_THEME, ...existing }
  const fromNotes = designNotes?.trim() ? parseThemeHints(designNotes) : {}
  const fromEdit = parseThemeHints(instructions)
  return { ...base, ...fromNotes, ...fromEdit }
}

export function applyThemeOnlyEdit(
  manifest: ArenaGenerativeAppManifest,
  instructions: string,
  designNotes?: string
): ArenaGenerativeAppManifest {
  return {
    ...manifest,
    theme: applyThemePatch(manifest.theme, instructions, designNotes),
  }
}

export function themeEditInstructions(theme: ArenaGenerativeTheme): string {
  const parts = [
    theme.brandColor ? `brandColor ${theme.brandColor}` : '',
    theme.density ? `density ${theme.density}` : '',
    theme.radius ? `radius ${theme.radius}` : '',
    theme.font ? `font ${theme.font}` : '',
    theme.colorScheme ? `colorScheme ${theme.colorScheme}` : '',
  ].filter((part) => part.length > 0)
  return `Set the theme to ${parts.join(', ')}.`
}
