/**
 * Explicit whole-app rebuild from Requested Changes. Ordinary edits stay
 * deltas; only these phrases take the generate path on an existing draft.
 */
const EXPLICIT_REPLAN = /\b(re-?plan|replan)\b/i
const START_OVER = /\b(start over|from scratch)\b/i
const REBUILD_WHOLE =
  /\b(re-?build|re-?generat(?:e|ion)|regenerat(?:e|ion))\b.{0,48}\b(the |this )?(app|sitemap|whole thing|entire (?:app|ui)|everything)\b/i
const REBUILD_WHOLE_REVERSED =
  /\b(the |this )?(whole |entire )?(app|sitemap)\b.{0,48}\b(re-?build|re-?generat(?:e|ion)|regenerat(?:e|ion))\b/i
const REPLACE_APP = /\breplace the (?:whole |entire )?(app|sitemap|ui)\b/i
const CHANGE_ARCHETYPE =
  /\b(make this|turn this into|change (?:this|the app|it) (?:in)?to)\b.{0,80}\b(dashboard|wizard|list[-\s]?detail|form[-\s]?result|search hero)\b/i

/**
 * True when Requested Changes asks to throw away the current sitemap and
 * generate a new app. Local "rebuild the search row" / "regenerate the score"
 * do not match.
 */
export function isReplanEdit(instructions: string): boolean {
  const text = instructions.trim()
  if (!text) return false
  return (
    EXPLICIT_REPLAN.test(text) ||
    START_OVER.test(text) ||
    REBUILD_WHOLE.test(text) ||
    REBUILD_WHOLE_REVERSED.test(text) ||
    REPLACE_APP.test(text) ||
    CHANGE_ARCHETYPE.test(text)
  )
}

/**
 * Planner payload for a re-plan: the new job first, the previous brief only
 * as background so bindings and domain are not forgotten.
 */
export function plannerInputForReplan(options: {
  editInstructions: string
  existingBrief?: string
}): string {
  const request = options.editInstructions.trim()
  const previous = options.existingBrief?.trim()
  if (!previous) return request
  return [
    'Re-plan request — this is the new job. Invent a new sitemap and archetype from it. Do not preserve the previous pages or layout.',
    request,
    'Previous product (replaced; use only as background for what the APIs were for):',
    previous,
  ].join('\n\n')
}
