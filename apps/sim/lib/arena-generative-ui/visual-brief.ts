import { z } from 'zod'
import { isArenaGenerativeCatalogType } from '@/lib/arena-generative-ui/catalog'
import { ARENA_GENERATIVE_VISUAL_TONES } from '@/lib/arena-generative-ui/design-intent'
import {
  ARENA_GENERATIVE_THEME_COLOR_SCHEMES,
  ARENA_GENERATIVE_THEME_DENSITIES,
} from '@/lib/arena-generative-ui/theme'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const VISUAL_ARCHETYPES = [
  'collection',
  'detail',
  'task',
  'results',
  'dashboard',
  'workflow',
  'content',
  'workspace',
] as const

const VISUAL_REPRESENTATIONS = ['list', 'table', 'cards'] as const

const VISUAL_SHELLS = ['minimal', 'none', 'tabs', 'sidebar', 'workspace'] as const

const VISUAL_REGIONS = ['navigator', 'primary', 'inspector', 'auxiliary'] as const

export const MATCH_SCREENSHOT_USER_INPUT =
  'Build an Arena app that matches the uploaded screenshot(s). Honour visible structure, regions, and copy. Map anything the catalog cannot represent instead of inventing CSS or custom widgets.'

const visualCopySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((value) => value.slice(0, 200))

const visualFieldSchema = z.object({
  name: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40).optional(),
})

const visualRegionSchema = z.object({
  region: z.enum(VISUAL_REGIONS),
  purpose: z.string().trim().min(1).max(240),
  archetype: z.enum(VISUAL_ARCHETYPES).optional(),
})

const visualScreenSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  inferredPath: z
    .string()
    .trim()
    .toLowerCase()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  purpose: z.string().trim().min(1).max(400),
  archetype: z.enum(VISUAL_ARCHETYPES).optional(),
  representation: z.enum(VISUAL_REPRESENTATIONS).optional(),
  regions: z.array(visualRegionSchema).max(4).default([]),
  visibleCopy: z.array(visualCopySchema).max(40).default([]),
  fields: z.array(visualFieldSchema).max(24).default([]),
  ctas: z.array(visualCopySchema).max(12).default([]),
})

const visualGapSchema = z.object({
  observed: z.string().trim().min(1).max(200),
  closestCatalogType: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) =>
      value && isArenaGenerativeCatalogType(value) ? value : undefined
    ),
  reason: z.string().trim().min(1).max(400),
})

const visualLayoutSchema = z.object({
  shell: z.enum(VISUAL_SHELLS).optional(),
  density: z.enum(ARENA_GENERATIVE_THEME_DENSITIES).optional(),
  colorScheme: z.enum(ARENA_GENERATIVE_THEME_COLOR_SCHEMES).optional(),
  visualTone: z.enum(ARENA_GENERATIVE_VISUAL_TONES).optional(),
  brandColor: z
    .string()
    .trim()
    .regex(HEX_COLOR)
    .optional()
    .transform((value) => (value ? value.toUpperCase() : undefined)),
})

export const arenaGenerativeVisualBriefSchema = z.object({
  screens: z.array(visualScreenSchema).min(1).max(6),
  layout: visualLayoutSchema.default({}),
  catalogMapping: z
    .array(
      z.object({
        observed: z.string().trim().min(1).max(200),
        catalogType: z.string().trim().min(1).max(64),
      })
    )
    .max(24)
    .default([]),
  unrepresentable: z.array(visualGapSchema).max(16).default([]),
})

export type ArenaGenerativeVisualBrief = z.output<typeof arenaGenerativeVisualBriefSchema>
export type ArenaGenerativeVisualGap = ArenaGenerativeVisualBrief['unrepresentable'][number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Fail-open parse of a vision-interpreter JSON object.
 */
export function parseArenaGenerativeVisualBrief(value: unknown): ArenaGenerativeVisualBrief | null {
  const parsed = arenaGenerativeVisualBriefSchema.safeParse(value)
  if (!parsed.success) return null
  const catalogMapping = parsed.data.catalogMapping.filter((item) =>
    isArenaGenerativeCatalogType(item.catalogType)
  )
  return { ...parsed.data, catalogMapping }
}

/**
 * Reads a visual brief nested on a stored structured-brief jsonb row.
 */
export function parseStoredVisualBrief(value: unknown): ArenaGenerativeVisualBrief | null {
  if (!isRecord(value) || !('visualBrief' in value)) return null
  return parseArenaGenerativeVisualBrief(value.visualBrief)
}

/**
 * Merges planner output with an optional visual brief for draft jsonb.
 */
export function packStoredStructuredBrief(
  brief: Record<string, unknown> | null | undefined,
  visualBrief: ArenaGenerativeVisualBrief | null | undefined
): Record<string, unknown> | null {
  if (!brief && !visualBrief) return null
  return {
    ...(brief ?? {}),
    ...(visualBrief ? { visualBrief } : {}),
  }
}

/**
 * Planner payload: screenshot structure is explicit. Do not invent pages the
 * shot does not imply unless User request requires them.
 */
export function formatVisualBriefForPlanner(brief: ArenaGenerativeVisualBrief): string {
  return [
    'Visual brief from uploaded screenshot(s). Visible structure, regions, fields, CTAs, and copy are explicit requirements.',
    'Do not add settings, profile, or marketing pages the screenshot does not show unless User request requires them.',
    'Map unrepresentable widgets to the closest catalog type. Do not invent CSS, hex padding, or custom components.',
    JSON.stringify(brief, null, 2),
  ].join('\n')
}

/**
 * Generator payload: implement the visual brief with catalog types and theme knobs only.
 */
export function formatVisualBriefForGenerator(brief: ArenaGenerativeVisualBrief): string {
  return [
    'Visual brief from uploaded screenshot(s). Match information architecture, regions, visible copy, and field labels.',
    'Use catalog types only. Honour catalogMapping. Do not emit unrepresentable widgets as custom CSS.',
    brief.layout.brandColor || brief.layout.density || brief.layout.colorScheme
      ? `Theme hints from the screenshot belong on manifest.theme (${[
          brief.layout.brandColor ? `brandColor ${brief.layout.brandColor}` : '',
          brief.layout.density ? `density ${brief.layout.density}` : '',
          brief.layout.colorScheme ? `colorScheme ${brief.layout.colorScheme}` : '',
        ]
          .filter(Boolean)
          .join(', ')}).`
      : '',
    JSON.stringify(brief, null, 2),
  ]
    .filter((section) => section.length > 0)
    .join('\n')
}

/**
 * Preview / generate-status line when the interpreter found catalog gaps.
 */
export function formatVisualBriefMatchNotes(brief: ArenaGenerativeVisualBrief): string {
  if (brief.unrepresentable.length === 0) return ''
  const gaps = brief.unrepresentable.map((gap) => {
    const closest = gap.closestCatalogType ? ` → ${gap.closestCatalogType}` : ''
    return `${gap.observed}${closest}`
  })
  return `This app approximates the uploaded screenshot using Arena components. Not represented: ${gaps.join('; ')}.`
}

export function formatVisualBriefStatus(
  brief: ArenaGenerativeVisualBrief | null,
  error?: string
): string {
  if (brief) {
    const gaps = brief.unrepresentable.length
    const screens = brief.screens.length
    return gaps > 0
      ? `Visual: ${screens} screen(s); ${gaps} catalog gap(s).`
      : `Visual: ${screens} screen(s).`
  }
  if (error) return `Visual skipped (${error}); planned from prose.`
  return ''
}
