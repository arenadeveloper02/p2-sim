import { chatTurnsFromState, withLastAssistantContent } from '@/lib/arena-generative-ui/chat-turns'
import { stampSelectionForeignKeys } from '@/lib/arena-generative-ui/local-discovery'
import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  ARENA_GENERATIVE_SELECTED_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
} from '@/lib/arena-generative-ui/types'

/** Cap on a concatenated list so Load more cannot grow without bound. */
export const MAX_APPENDED_ITEMS = 96

/**
 * Merges a CTA `setState` patch into host state. Keys listed in `appendKeys`
 * concatenate when both sides are arrays; everything else replaces. Hitting the
 * appended-length cap drops `hasMore` so Load more disappears.
 *
 * `chatTurns` concatenates (seeding from existing `content` on the first pair).
 * `__chatLastAssistant` patches the last assistant turn without replacing the list.
 */
export function mergeHostState(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  appendKeys?: readonly string[]
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, ...patch }
  delete next[ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY]

  const lastAssistant = patch[ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY]
  if (typeof lastAssistant === 'string') {
    const updated = withLastAssistantContent(
      current[ARENA_GENERATIVE_CHAT_TURNS_KEY],
      lastAssistant
    )
    if (updated) {
      next[ARENA_GENERATIVE_CHAT_TURNS_KEY] = updated
    }
  }

  if (!appendKeys || appendKeys.length === 0) {
    stampPatchedCollections(next, current, patch)
    return omitUndefinedPatchKeys(next, patch)
  }

  let capped = false
  for (const key of appendKeys) {
    if (key === ARENA_GENERATIVE_CHAT_TURNS_KEY) {
      const incoming = patch[key]
      if (!Array.isArray(incoming)) continue
      const previous = chatTurnsFromState(current)
      const seed = previous.length === 0 ? seedFromStreamedContent(current) : []
      const combined = [...(previous.length > 0 ? previous : seed), ...incoming]
      if (combined.length > MAX_APPENDED_ITEMS) {
        next[key] = combined.slice(0, MAX_APPENDED_ITEMS)
        capped = true
      } else {
        next[key] = combined
      }
      continue
    }
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
  stampPatchedCollections(next, current, patch)
  return omitUndefinedPatchKeys(next, patch)
}

function stampPatchedCollections(
  next: Record<string, unknown>,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): void {
  for (const key of Object.keys(patch)) {
    if (key === ARENA_GENERATIVE_CHAT_TURNS_KEY) continue
    const incoming = next[key]
    if (!Array.isArray(incoming)) continue
    const existing = current[key]
    next[key] = stampSelectionForeignKeys(
      incoming,
      Array.isArray(existing) ? existing : [],
      current[ARENA_GENERATIVE_SELECTED_ID_KEY],
      current[ARENA_GENERATIVE_SELECTED_KEY]
    )
  }
}

/**
 * `undefined` in a patch means drop the key (`clearItem`, onLoad arrival), not
 * store an empty slot that `showWhen` still sees.
 */
function omitUndefinedPatchKeys(
  next: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key]
  }
  return next
}

function seedFromStreamedContent(current: Record<string, unknown>): Array<{
  role: 'assistant'
  content: string
}> {
  const prior = current[ARENA_GENERATIVE_STREAM_CONTENT_KEY]
  if (typeof prior !== 'string' || !prior.trim()) return []
  return [{ role: 'assistant', content: prior }]
}
