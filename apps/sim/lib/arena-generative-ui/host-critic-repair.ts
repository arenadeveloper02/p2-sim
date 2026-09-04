import type { Spec } from '@json-render/core'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { extraPrimarySections } from '@/lib/arena-generative-ui/ui-critic'

interface FlatElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

function elementsOf(spec: Spec): Record<string, FlatElement> {
  return (spec.elements ?? {}) as Record<string, FlatElement>
}

function primaryRank(element: FlatElement | undefined): number {
  if (element?.type === 'SubmitButton') return 0
  if (element?.type === 'SearchField') return 1
  return 2
}

function pickKeeper(primaryIds: string[], elements: Record<string, FlatElement>): string {
  return [...primaryIds].sort((left, right) => {
    const rank = primaryRank(elements[left]) - primaryRank(elements[right])
    if (rank !== 0) return rank
    return primaryIds.indexOf(left) - primaryIds.indexOf(right)
  })[0]
}

function describeDemote(id: string, beforeType: string): string {
  if (beforeType === 'Button') return `"${id}" to a secondary Button`
  if (beforeType === 'SubmitButton') return `"${id}" from SubmitButton to a secondary Button`
  return `"${id}" from SearchField to a TextInput`
}

function demotePrimary(element: FlatElement): void {
  if (element.type === 'Button') {
    element.props = { ...element.props, variant: 'secondary' }
    return
  }
  if (element.type === 'SubmitButton') {
    element.type = 'Button'
    element.props = { ...element.props, variant: 'secondary' }
    return
  }
  if (element.type === 'SearchField') {
    const props = { ...element.props }
    delete props.actionId
    element.type = 'TextInput'
    element.props = props
  }
}

/**
 * Nearest host fix for proveable critic issues. Extra primary CTAs keep one
 * (SubmitButton, then SearchField, then the first primary Button) and demote
 * the rest so generate can succeed.
 */
export function repairHostCriticExtras(
  manifest: ArenaGenerativeAppManifest,
  options: { authoredPagePaths?: string[] } = {}
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  let next: ArenaGenerativeAppManifest | undefined

  for (const [pagePath, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(pagePath)) continue
    const extras = extraPrimarySections(page.spec)
    if (extras.length === 0) continue
    next ??= structuredClone(manifest)
    const spec = next.pages[pagePath]?.spec
    if (!spec) continue
    const elements = elementsOf(spec)
    for (const section of extras) {
      const keeper = pickKeeper(section.primaryIds, elements)
      if (!keeper) continue
      const demoted: string[] = []
      for (const id of section.primaryIds) {
        if (id === keeper) continue
        const element = elements[id]
        if (!element) continue
        const beforeType = element.type ?? 'Button'
        demotePrimary(element)
        demoted.push(describeDemote(id, beforeType))
      }
      if (demoted.length === 0) continue
      adoptedChanges.push({
        code: 'extra-primary',
        asked: `Section "${section.sectionId}" on page "${pagePath}" had more than one primary action (${section.primaryIds.join(', ')}).`,
        adopted: `Kept "${keeper}" as primary; changed ${demoted.join(', ')}.`,
      })
    }
  }

  return { manifest: next ?? manifest, adoptedChanges }
}
