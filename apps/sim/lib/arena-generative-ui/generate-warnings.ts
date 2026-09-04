import { z } from 'zod'

export const ARENA_GENERATIVE_GENERATE_WARNING_CODES = [
  'intent-skipped',
  'planner-failed',
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

const GENERATE_WARNINGS_KEY = 'generateWarnings'

const PIPELINE_WARNING_CODES = new Set<ArenaGenerativeGenerateWarningCode>([
  'intent-skipped',
  'planner-failed',
])

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
 * Writes or clears `generateWarnings` on a packed structured-brief jsonb value.
 * `undefined` warnings leave the packed object unchanged.
 */
export function applyGenerateWarningsToStoredBrief(
  packed: Record<string, unknown> | null,
  warnings: ArenaGenerativeGenerateWarning[] | undefined
): Record<string, unknown> | null {
  if (warnings === undefined) return packed
  if (!packed && warnings.length === 0) return null
  const next = { ...(packed ?? {}) }
  if (warnings.length === 0) {
    delete next[GENERATE_WARNINGS_KEY]
    return Object.keys(next).length === 0 ? null : next
  }
  next[GENERATE_WARNINGS_KEY] = warnings
  return next
}
