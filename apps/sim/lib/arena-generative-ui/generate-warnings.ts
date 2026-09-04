import { truncate } from '@sim/utils/string'
import { z } from 'zod'

export const ARENA_GENERATIVE_GENERATE_WARNING_CODES = [
  'intent-skipped',
  'planner-failed',
  'actions-dropped',
  'visual-skipped',
  'critic-skipped',
] as const

export type ArenaGenerativeGenerateWarningCode =
  (typeof ARENA_GENERATIVE_GENERATE_WARNING_CODES)[number]

export const arenaGenerativeGenerateWarningSchema = z.object({
  code: z.enum(ARENA_GENERATIVE_GENERATE_WARNING_CODES),
  message: z.string().trim().min(1).max(500),
})

export type ArenaGenerativeGenerateWarning = z.output<typeof arenaGenerativeGenerateWarningSchema>

export const ARENA_GENERATIVE_ADOPTED_CHANGE_CODES = ['extra-primary'] as const

export const arenaGenerativeAdoptedChangeSchema = z.object({
  code: z.enum(ARENA_GENERATIVE_ADOPTED_CHANGE_CODES),
  asked: z.string().trim().min(1).max(500),
  adopted: z.string().trim().min(1).max(500),
})

export type ArenaGenerativeAdoptedChange = z.output<typeof arenaGenerativeAdoptedChangeSchema>

const GENERATE_WARNINGS_KEY = 'generateWarnings'
const ADOPTED_CHANGES_KEY = 'adoptedChanges'

const PIPELINE_WARNING_CODES = new Set<ArenaGenerativeGenerateWarningCode>([
  'intent-skipped',
  'planner-failed',
  'actions-dropped',
])

const DROPPED_ACTION_WARNING_MAX = 500

/**
 * Author-visible note when the planner invented remote apiKeys that were
 * stripped so generate could keep the rest of the sitemap.
 */
export function formatDroppedActionsWarning(
  dropped: ReadonlyArray<{ id: string; apiKey?: string }>
): string | undefined {
  if (dropped.length === 0) return undefined
  const names = dropped
    .map((action) => (action.apiKey ? `${action.id} (apiKey "${action.apiKey}")` : action.id))
    .join(', ')
  return truncate(
    `Planner dropped action(s) ${names} — not a declared binding. Add the API or remap the CTA.`,
    DROPPED_ACTION_WARNING_MAX - 3,
    '...'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Fail-open skips from one generate or edit run. Preserve edits keep the
 * original intent/planner fallbacks; critic and visual come from this run.
 */
export function collectGenerateWarnings(input: {
  intentError?: string
  plannerError?: string
  droppedActions?: ReadonlyArray<{ id: string; apiKey?: string }>
  visualBriefError?: string
  criticSkipped?: boolean
  isPreserveEdit?: boolean
  existing?: readonly ArenaGenerativeGenerateWarning[]
}): ArenaGenerativeGenerateWarning[] {
  const current: ArenaGenerativeGenerateWarning[] = []
  if (!input.isPreserveEdit && input.intentError) {
    current.push({
      code: 'intent-skipped',
      message: `Intent skipped (${input.intentError}); planner inferred from prose.`,
    })
  }
  if (!input.isPreserveEdit && input.plannerError) {
    current.push({
      code: 'planner-failed',
      message: `Planner failed (${input.plannerError}); generated from the prose brief.`,
    })
  }
  if (!input.isPreserveEdit) {
    const droppedMessage = formatDroppedActionsWarning(input.droppedActions ?? [])
    if (droppedMessage) {
      current.push({
        code: 'actions-dropped',
        message: droppedMessage,
      })
    }
  }
  if (input.visualBriefError) {
    current.push({
      code: 'visual-skipped',
      message: `Visual skipped (${input.visualBriefError}); planned from prose.`,
    })
  }
  if (input.criticSkipped) {
    current.push({
      code: 'critic-skipped',
      message: 'UI critic: skipped (unavailable)',
    })
  }
  if (!input.isPreserveEdit) return current
  const kept = (input.existing ?? []).filter((warning) => PIPELINE_WARNING_CODES.has(warning.code))
  return [...kept, ...current]
}

function adoptedChangeKey(change: ArenaGenerativeAdoptedChange): string {
  return `${change.code}:${change.asked}:${change.adopted}`
}

/**
 * Host auto-repairs from this run. Preserve edits keep earlier adopted changes.
 */
export function collectAdoptedChanges(input: {
  isPreserveEdit?: boolean
  existing?: readonly ArenaGenerativeAdoptedChange[]
  current?: readonly ArenaGenerativeAdoptedChange[]
}): ArenaGenerativeAdoptedChange[] {
  const current = input.current ?? []
  if (!input.isPreserveEdit) return [...current]
  const seen = new Set(current.map(adoptedChangeKey))
  const kept = (input.existing ?? []).filter((change) => !seen.has(adoptedChangeKey(change)))
  return [...kept, ...current]
}

/**
 * Reads generate warnings nested on a stored structured-brief jsonb row.
 */
export function parseStoredGenerateWarnings(value: unknown): ArenaGenerativeGenerateWarning[] {
  if (!isRecord(value) || !Array.isArray(value[GENERATE_WARNINGS_KEY])) return []
  const parsed = z
    .array(arenaGenerativeGenerateWarningSchema)
    .safeParse(value[GENERATE_WARNINGS_KEY])
  return parsed.success ? parsed.data : []
}

/**
 * Reads host auto-repairs nested on a stored structured-brief jsonb row.
 */
export function parseStoredAdoptedChanges(value: unknown): ArenaGenerativeAdoptedChange[] {
  if (!isRecord(value) || !Array.isArray(value[ADOPTED_CHANGES_KEY])) return []
  const parsed = z
    .array(arenaGenerativeAdoptedChangeSchema)
    .safeParse(value[ADOPTED_CHANGES_KEY])
  return parsed.success ? parsed.data : []
}

export interface GenerateNotesPatch {
  generateWarnings?: ArenaGenerativeGenerateWarning[]
  adoptedChanges?: ArenaGenerativeAdoptedChange[]
}

function writeNoteArray<T>(
  next: Record<string, unknown>,
  key: string,
  items: T[] | undefined
): void {
  if (items === undefined) return
  if (items.length === 0) {
    delete next[key]
    return
  }
  next[key] = items
}

/**
 * Writes or clears generate notes on a packed structured-brief jsonb value.
 * Omitted fields leave that key unchanged.
 */
export function applyGenerateNotesToStoredBrief(
  packed: Record<string, unknown> | null,
  notes: GenerateNotesPatch
): Record<string, unknown> | null {
  if (notes.generateWarnings === undefined && notes.adoptedChanges === undefined) {
    return packed
  }
  const next = { ...(packed ?? {}) }
  writeNoteArray(next, GENERATE_WARNINGS_KEY, notes.generateWarnings)
  writeNoteArray(next, ADOPTED_CHANGES_KEY, notes.adoptedChanges)
  return Object.keys(next).length === 0 ? null : next
}

/**
 * Writes or clears `generateWarnings` on a packed structured-brief jsonb value.
 * `undefined` warnings leave the packed object unchanged.
 */
export function applyGenerateWarningsToStoredBrief(
  packed: Record<string, unknown> | null,
  warnings: ArenaGenerativeGenerateWarning[] | undefined
): Record<string, unknown> | null {
  return applyGenerateNotesToStoredBrief(packed, { generateWarnings: warnings })
}
