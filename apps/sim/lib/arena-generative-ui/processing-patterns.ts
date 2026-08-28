/**
 * Composable wait kinds for form-result. The archetype is the three-beat
 * sitemap; these modules say how the processing beat looks. Catalog types only.
 */

export const ARENA_GENERATIVE_PROCESSING_PATTERNS = [
  'short',
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
] as const

export type ArenaGenerativeProcessingPattern = (typeof ARENA_GENERATIVE_PROCESSING_PATTERNS)[number]

const PATTERN_SET = new Set<string>(ARENA_GENERATIVE_PROCESSING_PATTERNS)

const LONG_WAIT_PATTERNS = new Set<ArenaGenerativeProcessingPattern>([
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
])

const PROCESSING_PATTERN_PROMPTS: Record<ArenaGenerativeProcessingPattern, string> = {
  short: [
    'PROCESSING PATTERN: SHORT OPERATION',
    'Submit, navigate, bind the result. The host skeletons the bound region. Do not emit WorkingCard, ProgressBar, Spinner, or Cancel.',
  ].join('\n'),
  'long-running': [
    'PROCESSING PATTERN: LONG-RUNNING OPERATION',
    'The wait is a named job (workflow, generate, analysis). Put WorkingCard on the destination (title interpolating form names, estimate, skeleton true) above the bound result. The host ticks the card. Do not emit ProgressSteps, ProgressBar, or Spinner. Do not leave waiting chrome on the form.',
  ].join('\n'),
  streaming: [
    'PROCESSING PATTERN: STREAMING OPERATION',
    'Bind DataText statePath "content" (or layoutPlan hostKeys). The host streams chunks into that region. Do not invent Table columns from unstructured output. WorkingCard only when LONG-RUNNING or MULTI-STEP is also selected.',
  ].join('\n'),
  'multi-step': [
    'PROCESSING PATTERN: MULTI-STEP OPERATION',
    'WorkingCard.steps are the brief’s checklist (one line per step). The host ticks steps and the bar together. Do not emit ProgressSteps as a sibling.',
  ].join('\n'),
  cancellable: [
    'PROCESSING PATTERN: CANCELLABLE',
    'WorkingCard.cancelTo is the form path. Do not emit a second Cancel Button.',
  ].join('\n'),
}

/**
 * Prompt fragment for the selected wait kinds, in canonical order. Empty when
 * the archetype is not form-result (or the gold form-result fallback).
 */
export function processingPatternPrompt(
  patterns: readonly ArenaGenerativeProcessingPattern[]
): string {
  return ARENA_GENERATIVE_PROCESSING_PATTERNS.filter((pattern) => patterns.includes(pattern))
    .map((pattern) => PROCESSING_PATTERN_PROMPTS[pattern])
    .join('\n\n')
}

function asProcessingPattern(value: string): ArenaGenerativeProcessingPattern | null {
  return PATTERN_SET.has(value) ? (value as ArenaGenerativeProcessingPattern) : null
}

export function isProcessingPattern(value: string): value is ArenaGenerativeProcessingPattern {
  return PATTERN_SET.has(value)
}

/**
 * Combine planner tags with binding signals. Workflow → long-running; stream →
 * streaming. `short` drops when any longer wait is present. Non-form-result
 * archetypes get no processing modules.
 */
export function resolveProcessingPatterns(options: {
  archetype?: string
  planned?: readonly string[]
  bindings: ReadonlyArray<{ kind?: string; stream?: boolean }>
}): ArenaGenerativeProcessingPattern[] {
  const isFormResult = !options.archetype || options.archetype === 'form-result'
  if (!isFormResult) return []

  const selected = new Set<ArenaGenerativeProcessingPattern>()
  for (const raw of options.planned ?? []) {
    const pattern = asProcessingPattern(raw)
    if (pattern) selected.add(pattern)
  }
  if (options.bindings.some((binding) => binding.stream === true)) {
    selected.add('streaming')
  }
  if (options.bindings.some((binding) => binding.kind === 'workflow')) {
    selected.add('long-running')
  }
  if ([...selected].some((pattern) => LONG_WAIT_PATTERNS.has(pattern))) {
    selected.delete('short')
  }
  if (selected.size === 0) selected.add('short')
  return ARENA_GENERATIVE_PROCESSING_PATTERNS.filter((pattern) => selected.has(pattern))
}
