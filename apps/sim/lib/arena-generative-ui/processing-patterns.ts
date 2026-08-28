/**
 * Wait-kind aliases kept so stored briefs with `processing` still parse.
 * New recipes live in capabilities.ts.
 */

import {
  type ArenaGenerativeCapability,
  capabilityRecipePrompt,
  isCapability,
  resolveCapabilities,
} from '@/lib/arena-generative-ui/capabilities'

export const ARENA_GENERATIVE_PROCESSING_PATTERNS = [
  'short',
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
] as const

export type ArenaGenerativeProcessingPattern = (typeof ARENA_GENERATIVE_PROCESSING_PATTERNS)[number]

const PROCESSING_SET = new Set<string>(ARENA_GENERATIVE_PROCESSING_PATTERNS)

const WAIT_CAPABILITIES = [
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
] as const satisfies readonly ArenaGenerativeCapability[]

export function isProcessingPattern(value: string): value is ArenaGenerativeProcessingPattern {
  return PROCESSING_SET.has(value)
}

/**
 * Wait-capability prompt fragment. `short` is not a recipe (omit wait modules).
 */
export function processingPatternPrompt(
  patterns: readonly ArenaGenerativeProcessingPattern[]
): string {
  return capabilityRecipePrompt(patterns.filter(isCapability))
}

/**
 * Wait subset of {@link resolveCapabilities}. No longer form-result-only; `short`
 * is not emitted.
 */
export function resolveProcessingPatterns(options: {
  archetype?: string
  planned?: readonly string[]
  bindings: ReadonlyArray<{ kind?: string; stream?: boolean; pagination?: unknown }>
}): ArenaGenerativeProcessingPattern[] {
  const resolved = resolveCapabilities({
    planned: options.planned,
    bindings: options.bindings,
  })
  return WAIT_CAPABILITIES.filter((capability) => resolved.includes(capability))
}
