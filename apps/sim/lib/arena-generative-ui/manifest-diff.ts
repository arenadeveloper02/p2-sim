import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

export interface ManifestRevisionDiff {
  fromRevision: number
  toRevision: number
  pagesAdded: string[]
  pagesRemoved: string[]
  pagesChanged: string[]
  actionsAdded: string[]
  actionsRemoved: string[]
  themeChanged: boolean
  summary: string
}

function sortedKeys(record: Record<string, unknown> | undefined): string[] {
  return Object.keys(record ?? {}).sort((left, right) => left.localeCompare(right))
}

function addedRemoved(previous: string[], next: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(previous)
  const nextSet = new Set(next)
  return {
    added: next.filter((key) => !prevSet.has(key)),
    removed: previous.filter((key) => !nextSet.has(key)),
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * High-level change list between two draft revisions, for the Deploy panel.
 * Spec JSON is compared per page; a one-character copy tweak counts as changed.
 */
export function summarizeManifestDiff(
  previous: ArenaGenerativeAppManifest | undefined,
  next: ArenaGenerativeAppManifest,
  fromRevision: number,
  toRevision: number
): ManifestRevisionDiff | null {
  if (!previous || fromRevision <= 0 || fromRevision === toRevision) return null

  const prevPages = sortedKeys(previous.pages)
  const nextPages = sortedKeys(next.pages)
  const pageDelta = addedRemoved(prevPages, nextPages)
  const sharedPages = nextPages.filter((path) => previous.pages[path])
  const pagesChanged = sharedPages.filter((path) => {
    const before = previous.pages[path]
    const after = next.pages[path]
    return (
      before.title !== after.title ||
      stableJson(before.onLoad) !== stableJson(after.onLoad) ||
      stableJson(before.spec) !== stableJson(after.spec)
    )
  })

  const prevActions = sortedKeys(previous.actions)
  const nextActions = sortedKeys(next.actions)
  const actionDelta = addedRemoved(prevActions, nextActions)
  const themeChanged = stableJson(previous.theme) !== stableJson(next.theme)

  const parts: string[] = [`r${fromRevision} → r${toRevision}`]
  if (pageDelta.added.length > 0) parts.push(`added page ${pageDelta.added.join(', ')}`)
  if (pageDelta.removed.length > 0) parts.push(`removed page ${pageDelta.removed.join(', ')}`)
  if (pagesChanged.length > 0) parts.push(`changed ${pagesChanged.join(', ')}`)
  if (actionDelta.added.length > 0) parts.push(`added action ${actionDelta.added.join(', ')}`)
  if (actionDelta.removed.length > 0) parts.push(`removed action ${actionDelta.removed.join(', ')}`)
  if (themeChanged) parts.push('updated theme')
  const summary =
    parts.length === 1
      ? `${parts[0]}: no structural changes`
      : `${parts[0]}: ${parts.slice(1).join('; ')}`

  return {
    fromRevision,
    toRevision,
    pagesAdded: pageDelta.added,
    pagesRemoved: pageDelta.removed,
    pagesChanged,
    actionsAdded: actionDelta.added,
    actionsRemoved: actionDelta.removed,
    themeChanged,
    summary,
  }
}
