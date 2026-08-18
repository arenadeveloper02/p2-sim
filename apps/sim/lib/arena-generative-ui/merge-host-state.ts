/** Cap on a concatenated list so Load more cannot grow without bound. */
export const MAX_APPENDED_ITEMS = 96

/**
 * Merges a CTA `setState` patch into host state. Keys listed in `appendKeys`
 * concatenate when both sides are arrays; everything else replaces. Hitting the
 * appended-length cap drops `hasMore` so Load more disappears.
 */
export function mergeHostState(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  appendKeys?: readonly string[]
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, ...patch }
  if (!appendKeys || appendKeys.length === 0) {
    return next
  }

  let capped = false
  for (const key of appendKeys) {
    const previous = current[key]
    const incoming = patch[key]
    if (!Array.isArray(previous) || !Array.isArray(incoming)) continue
    const combined = [...previous, ...incoming]
    if (combined.length > MAX_APPENDED_ITEMS) {
      next[key] = combined.slice(0, MAX_APPENDED_ITEMS)
      capped = true
    } else {
      next[key] = combined
    }
  }
  if (capped) {
    next.hasMore = false
  }
  return next
}
