import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'

/**
 * Pages and manifest-level fields a scoped edit is allowed to rewrite. Structural
 * on purpose so this module needs no dependency on the scoping call that produces it.
 */
export interface ScopedEditTarget {
  pages: string[]
  touchesActions: boolean
  touchesTheme: boolean
}

export type ScopedEditMergeResult =
  | { ok: true; candidate: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Reply pages as a path-keyed record. A scoped reply should already be keyed by
 * path, but models reach for an array; an array entry without an explicit valid
 * `path` is rejected rather than guessed, because guessing a path in a scoped
 * edit would overwrite the wrong page.
 */
function replyPagesRecord(
  raw: unknown
): { ok: true; pages: Record<string, unknown> } | { ok: false; error: string } {
  if (Array.isArray(raw)) {
    const pages: Record<string, unknown> = {}
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        return { ok: false, error: 'Each entry of "pages" must be an object.' }
      }
      const path = (entry as Record<string, unknown>).path
      if (typeof path !== 'string' || !ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN.test(path.trim())) {
        return {
          ok: false,
          error: 'Return "pages" as an object keyed by page path, not an array.',
        }
      }
      pages[path.trim()] = entry
    }
    return { ok: true, pages }
  }
  if (raw && typeof raw === 'object') {
    return { ok: true, pages: raw as Record<string, unknown> }
  }
  return { ok: false, error: 'The reply is missing a "pages" object.' }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Folds a scoped edit reply into the existing manifest, producing a raw candidate
 * for `validateArenaGenerativeManifest`.
 *
 * Pages outside `scope.pages` are carried over by reference and never read from
 * the reply, so an untouched page is byte-identical by construction rather than
 * because the prompt asked the model to preserve it. A scoped page the reply
 * omits simply keeps its existing spec.
 *
 * `actions` merge key-wise — a reply that returns only the actions it changed
 * must not drop the rest. `entryPath` is always kept: changing the opening page
 * is a manifest-level edit that belongs on the global path.
 */
export function mergeScopedManifestEdit(
  existing: ArenaGenerativeAppManifest,
  reply: Record<string, unknown>,
  scope: ScopedEditTarget
): ScopedEditMergeResult {
  const scoped = new Set(scope.pages)
  if (scoped.size === 0) {
    return { ok: false, error: 'No pages were in scope for this edit.' }
  }

  const parsedPages = replyPagesRecord(reply.pages)
  if (!parsedPages.ok) {
    return parsedPages
  }

  const replacements: Record<string, unknown> = {}
  for (const [path, page] of Object.entries(parsedPages.pages)) {
    if (!scoped.has(path)) {
      return {
        ok: false,
        error: `Page "${path}" was not in scope for this edit. Return only these pages: ${scope.pages.join(', ')}.`,
      }
    }
    if (!page || typeof page !== 'object') {
      return { ok: false, error: `Page "${path}" is not an object.` }
    }
    replacements[path] = { ...(page as Record<string, unknown>), path }
  }

  if (Object.keys(replacements).length === 0) {
    return {
      ok: false,
      error: `The reply changed no pages. Return the updated spec for: ${scope.pages.join(', ')}.`,
    }
  }

  const replyActions = scope.touchesActions ? asRecord(reply.actions) : undefined
  const replyTheme = scope.touchesTheme ? asRecord(reply.theme) : undefined
  const theme = replyTheme ?? existing.theme

  return {
    ok: true,
    candidate: {
      entryPath: existing.entryPath,
      pages: { ...existing.pages, ...replacements },
      actions: replyActions ? { ...existing.actions, ...replyActions } : existing.actions,
      ...(theme ? { theme } : {}),
    },
  }
}
