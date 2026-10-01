import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { splitNavTarget } from '@/lib/arena-generative-ui/types'

export type EditImpactKind = 'knob' | 'patch' | 'partial-replan'

export interface EditImpact {
  kind: EditImpactKind
  pages: string[]
  navigateWhen?: 'immediate' | 'success'
  summary: string
}

const WAIT_HERE =
  /\b(?:wait here|stay on (?:this|the) (?:page|form)|show (?:the )?loader (?:here|on the form)|leave after (?:it |the )?(?:succeeds|success))\b/i
const LEAVE_NOW =
  /\b(?:leave now|navigate first|open the results page first|show the loader on the results)\b/i
const SURFACE_MOVE =
  /\b(?:own page|separate page|its own page|on this page|same page)\b/i
const OTHER_ASK =
  /\b(?:add|remove|rename|change|move|replace|column|dashboard|title|label|button)\b/i

/**
 * Lists pages that share a navigation, an action, or the entry, before any rewrite.
 */
export function editImpact(
  manifest: ArenaGenerativeAppManifest,
  text: string
): EditImpact {
  const pages = relatedPagePaths(manifest)
  const where = pageRoleSummary(manifest, pages)
  const trimmed = text.trim()
  if (SURFACE_MOVE.test(trimmed)) {
    return {
      kind: 'partial-replan',
      pages,
      summary: `Partial replan of ${pages.join(', ')}. ${where} Put the article and the loader on the page named in the request. Keep a place to retry if the rewrite fails.`,
    }
  }
  const navigateWhen = !OTHER_ASK.test(trimmed)
    ? WAIT_HERE.test(trimmed) && !LEAVE_NOW.test(trimmed)
      ? 'success'
      : LEAVE_NOW.test(trimmed) && !WAIT_HERE.test(trimmed)
        ? 'immediate'
        : undefined
    : undefined
  if (navigateWhen) {
    return {
      kind: 'knob',
      pages: [],
      navigateWhen,
      summary: `Host sets navigateWhen to ${navigateWhen} and moves the loader. No page rewrite.`,
    }
  }
  return {
    kind: 'patch',
    pages,
    summary: `Patch may touch ${pages.join(', ')}. ${where} Leave every other page as it is.`,
  }
}

/**
 * Prompt block. The model classifies the sentence; this list is the host's graph.
 */
export function formatEditImpact(impact: EditImpact): string {
  return [`Edit impact: ${impact.kind}.`, impact.summary].join(' ')
}

function relatedPagePaths(manifest: ArenaGenerativeAppManifest): string[] {
  const related = new Set<string>([manifest.entryPath])
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const dest = splitNavTarget(action.onSuccess?.navigate).path
    if (dest && manifest.pages[dest]) related.add(dest)
    if (!dest) continue
    for (const [path, page] of Object.entries(manifest.pages)) {
      const blob = JSON.stringify(page.spec)
      if (blob.includes(`"${actionId}"`)) related.add(path)
    }
  }
  const listed = [...related].filter((path) => manifest.pages[path])
  return listed.length > 0 ? listed : Object.keys(manifest.pages)
}

function pageRoleSummary(manifest: ArenaGenerativeAppManifest, pages: string[]): string {
  const parts = pages.map((path) => {
    const elements = manifest.pages[path]?.spec.elements ?? {}
    const types = new Set(
      Object.values(elements).map((element) =>
        element && typeof element === 'object' && 'type' in element
          ? String((element as { type?: string }).type ?? '')
          : ''
      )
    )
    const roles: string[] = []
    if (types.has('Form') || types.has('SearchField')) roles.push('form')
    if (types.has('WorkingCard') || types.has('Spinner') || types.has('Skeleton')) {
      roles.push('loader')
    }
    if (types.has('DataText') || types.has('Markdown')) roles.push('article')
    return `${path}: ${roles.join(', ') || 'page'}`
  })
  return parts.join('; ')
}
