const MAX_EDIT_DISTANCE = 2

export interface ClosestDeclaredNameOptions {
  /**
   * When exactly one declared name exists, remap any non-empty miss to it.
   * Used for CTA apiKeys, never for form fields or statePaths.
   */
  singleNameFallback?: boolean
}

function normalizeDeclaredToken(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, '')
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0
  const leftLength = left.length
  const rightLength = right.length
  if (leftLength === 0) return rightLength
  if (rightLength === 0) return leftLength

  const previous = Array.from({ length: rightLength + 1 }, (_, index) => index)
  for (let i = 1; i <= leftLength; i += 1) {
    let previousDiagonal = previous[0] ?? 0
    previous[0] = i
    for (let j = 1; j <= rightLength; j += 1) {
      const current = previous[j] ?? 0
      const substitution = left[i - 1] === right[j - 1] ? 0 : 1
      previous[j] = Math.min(
        current + 1,
        (previous[j - 1] ?? 0) + 1,
        previousDiagonal + substitution
      )
      previousDiagonal = current
    }
  }
  return previous[rightLength] ?? rightLength
}

/**
 * Unique closest declared spelling for a candidate name. Returns undefined on
 * empty input, no declared names, or a tie — never guesses.
 */
export function closestDeclaredName(
  candidate: string,
  declared: readonly string[],
  options: ClosestDeclaredNameOptions = {}
): string | undefined {
  const trimmed = candidate.trim()
  if (!trimmed || declared.length === 0) {
    return undefined
  }

  const exact = declared.find((name) => name === trimmed)
  if (exact) {
    return exact
  }

  const lower = trimmed.toLowerCase()
  const caseMatches = declared.filter((name) => name.toLowerCase() === lower)
  if (caseMatches.length === 1) {
    return caseMatches[0]
  }
  if (caseMatches.length > 1) {
    return undefined
  }

  const token = normalizeDeclaredToken(trimmed)
  const tokenMatches = declared.filter((name) => normalizeDeclaredToken(name) === token)
  if (tokenMatches.length === 1) {
    return tokenMatches[0]
  }
  if (tokenMatches.length > 1) {
    return undefined
  }

  const scored = declared
    .map((name) => ({
      name,
      distance: editDistance(normalizeDeclaredToken(name), token),
    }))
    .filter((entry) => entry.distance > 0 && entry.distance <= MAX_EDIT_DISTANCE)
  if (scored.length > 0) {
    const best = Math.min(...scored.map((entry) => entry.distance))
    const winners = scored.filter((entry) => entry.distance === best)
    if (winners.length === 1) {
      return winners[0]?.name
    }
    return undefined
  }

  if (options.singleNameFallback && declared.length === 1) {
    return declared[0]
  }

  return undefined
}
