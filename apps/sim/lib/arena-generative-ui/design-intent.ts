/**
 * Classification card for every generated app. Closed enums only; catalog types
 * only. Not an LLM stage. Density, tone, and product type are not element props.
 */

export const ARENA_GENERATIVE_PRODUCT_TYPES = [
  'saas',
  'analytics',
  'crm',
  'marketing',
  'finance',
  'productivity',
  'content',
] as const

export const ARENA_GENERATIVE_INTENT_DENSITIES = ['compact', 'comfortable', 'roomy'] as const

export const ARENA_GENERATIVE_VISUAL_TONES = [
  'professional',
  'friendly',
  'premium',
  'technical',
  'editorial',
] as const

export const ARENA_GENERATIVE_CONTENT_TYPES = [
  'data-heavy',
  'workflow',
  'narrative',
  'transactional',
] as const

export const ARENA_GENERATIVE_EMPHASES = ['task', 'data', 'content', 'discovery'] as const

export const ARENA_GENERATIVE_VISUAL_PRIORITIES = [
  'content',
  'task',
  'data',
  'discovery',
] as const

export const ARENA_GENERATIVE_INTERACTION_STYLES = [
  'task-oriented',
  'data-oriented',
  'content-first',
  'actionable',
  'scannable',
  'progressive',
] as const

export type ArenaGenerativeProductType = (typeof ARENA_GENERATIVE_PRODUCT_TYPES)[number]
export type ArenaGenerativeIntentDensity = (typeof ARENA_GENERATIVE_INTENT_DENSITIES)[number]
export type ArenaGenerativeVisualTone = (typeof ARENA_GENERATIVE_VISUAL_TONES)[number]
export type ArenaGenerativeContentType = (typeof ARENA_GENERATIVE_CONTENT_TYPES)[number]
export type ArenaGenerativeEmphasis = (typeof ARENA_GENERATIVE_EMPHASES)[number]
export type ArenaGenerativeVisualPriority = (typeof ARENA_GENERATIVE_VISUAL_PRIORITIES)[number]
export type ArenaGenerativeInteractionStyle = (typeof ARENA_GENERATIVE_INTERACTION_STYLES)[number]

export interface ArenaGenerativeDesignIntent {
  productType?: ArenaGenerativeProductType
  density?: ArenaGenerativeIntentDensity
  visualTone?: ArenaGenerativeVisualTone
  /** Contract axis; aliases visualTone when the planner emits `tone`. */
  tone?: ArenaGenerativeVisualTone
  contentType?: ArenaGenerativeContentType
  emphasis?: ArenaGenerativeEmphasis
  visualPriority?: ArenaGenerativeVisualPriority
  interactionStyle?: ArenaGenerativeInteractionStyle
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

function readAxis(record: Record<string, unknown>, camel: string, snake: string): unknown {
  return record[camel] ?? record[snake]
}

/** Maps planner `spacious` onto theme `roomy` so density stays one enum. */
export function normalizeDesignIntentDensity(
  value: unknown
): ArenaGenerativeIntentDensity | undefined {
  if (value === 'spacious') return 'roomy'
  return asEnum(value, ARENA_GENERATIVE_INTENT_DENSITIES)
}

/**
 * Fail-open parse: unknown axes are dropped. An empty or non-object value is
 * omitted so a typo cannot fail the structured brief.
 */
export function parseArenaGenerativeDesignIntent(
  value: unknown
): ArenaGenerativeDesignIntent | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const intent: ArenaGenerativeDesignIntent = {}
  const productType = asEnum(
    readAxis(record, 'productType', 'product_type'),
    ARENA_GENERATIVE_PRODUCT_TYPES
  )
  if (productType) intent.productType = productType
  const density = normalizeDesignIntentDensity(record.density)
  if (density) intent.density = density
  const visualTone =
    asEnum(readAxis(record, 'visualTone', 'visual_tone'), ARENA_GENERATIVE_VISUAL_TONES) ??
    asEnum(record.tone, ARENA_GENERATIVE_VISUAL_TONES)
  if (visualTone) {
    intent.visualTone = visualTone
    intent.tone = visualTone
  }
  const contentType = asEnum(
    readAxis(record, 'contentType', 'content_type'),
    ARENA_GENERATIVE_CONTENT_TYPES
  )
  if (contentType) intent.contentType = contentType
  const emphasis = asEnum(record.emphasis, ARENA_GENERATIVE_EMPHASES)
  if (emphasis) intent.emphasis = emphasis
  const visualPriority =
    asEnum(readAxis(record, 'visualPriority', 'visual_priority'), ARENA_GENERATIVE_VISUAL_PRIORITIES) ??
    (emphasis ? (emphasis as ArenaGenerativeVisualPriority) : undefined)
  if (visualPriority) intent.visualPriority = visualPriority
  const interactionStyle = asEnum(
    readAxis(record, 'interactionStyle', 'interaction_style'),
    ARENA_GENERATIVE_INTERACTION_STYLES
  )
  if (interactionStyle) intent.interactionStyle = interactionStyle
  return Object.keys(intent).length > 0 ? intent : undefined
}

/**
 * Spec-prompt mapping table. Classification only — not component props.
 * Product-type templates (collection → crm) are planner-owned, not generator-owned.
 */
export const ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT = [
  'DESIGN INTENT',
  'Honour a structured-brief designIntent / design object when present. These are classification only — do not emit them as component props, and do not paint chrome, hex, fonts, or radius to express tone. DESIGN GUIDELINES still owns how to compose. If omitted, default comfortable / professional / task-oriented.',
  'density: compact | comfortable | roomy — manifest.theme.density only (spacious means roomy). If density is compact or roomy and Design Notes did not name density, emit that theme.density. Tokens scale with it.',
  'tone: professional | friendly | premium | technical | editorial. professional is the default Arena voice. friendly — warmer copy, still the same chrome. premium — more whitespace, Card variant "muted", not glassmorphism or extra fills. technical — labels and KeyValue over marketing prose. editorial — long DataText, Section "narrow".',
  'visualPriority: content | task | data | discovery — what sits at L2. task — SubmitButton or SearchField. data — Table. content — DataText. discovery — Repeat of Cards. Do not invent Stat rows unless the blueprint named metrics.',
  'interactionStyle: task-oriented | data-oriented | content-first | actionable | scannable | progressive. task-oriented / actionable — one clear CTA. data-oriented / scannable — collection density. content-first — readable measure. progressive — WorkingCard then result.',
].join('\n')
