/**
 * True when `pattern` matches a positive product ask. A hit after
 * "do not add / never / without / must not become" does not count.
 */
export function hasPositiveAsk(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags)
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0
    const before = text.slice(Math.max(0, start - 72), start)
    if (NEGATION_BEFORE.test(before)) continue
    return true
  }
  return false
}

const NEGATION_BEFORE =
  /(?:\b(?:do\s+not|don't|dont|never|without|avoid|skip|must\s+not|not\s+become)\b\s+(?:(?:add|make|include|create|emit|plan|use|become|turn(?:\s+this)?(?:\s+into)?)\s+)?(?:(?:a|an|the|this|any)\s+)?(?:\w+\s+){0,4})$/i
