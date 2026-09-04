import type { Spec } from '@json-render/core'
import {
  type ArenaGenerativeAppManifest,
  parseTabItems,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'

interface FlatElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

/** Props the LLM critic needs; everything else stays off the compact payload. */
export const CRITIC_ELEMENT_PROP_KEYS = [
  'actionId',
  'navigateTo',
  'href',
  'to',
  'statePath',
  'emptyText',
  'variant',
  'label',
  'columns',
  'value',
  'values',
  'chartType',
  'series',
  'categories',
  'selectItem',
  'clearItem',
  'setValue',
  'cancelTo',
] as const

/** Sibling Cards that are not Repeat items before the host flags density. */
export const MAX_NON_REPEAT_CARDS_PER_PAGE = 8

const INVENTED_REPRESENTATION_TYPES = new Set(['Kanban', 'Timeline', 'List'])

export interface HostCriticOptions {
  authoredPagePaths?: string[]
}

export interface CriticElementView {
  id: string
  type: string
  props: Record<string, unknown>
}

export interface CriticPageView {
  path: string
  title: string
  onLoad?: string[]
  elements: CriticElementView[]
}

export interface CompactCriticManifest {
  entryPath: string
  pages: CriticPageView[]
  actions: ArenaGenerativeAppManifest['actions']
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true'
}

function elementsOf(spec: Spec): Record<string, FlatElement> {
  return (spec.elements ?? {}) as Record<string, FlatElement>
}

function parentByChildId(elements: Record<string, FlatElement>): Map<string, string> {
  const parent = new Map<string, string>()
  for (const [id, element] of Object.entries(elements)) {
    for (const childId of element.children ?? []) {
      parent.set(childId, id)
    }
  }
  return parent
}

function idsInsideType(elements: Record<string, FlatElement>, type: string): Set<string> {
  const inside = new Set<string>()
  const queue: string[] = []
  for (const element of Object.values(elements)) {
    if (element.type === type) {
      queue.push(...(element.children ?? []))
    }
  }
  while (queue.length > 0) {
    const id = queue.pop()
    if (!id || inside.has(id)) continue
    inside.add(id)
    queue.push(...(elements[id]?.children ?? []))
  }
  return inside
}

function isLiteralValue(value: unknown): boolean {
  if (typeof value === 'number' && Number.isFinite(value)) return true
  if (typeof value === 'string' && value.trim() !== '') return true
  return Array.isArray(value) && value.length > 0
}

function hasBindings(manifest: ArenaGenerativeAppManifest): boolean {
  return Object.values(manifest.actions).some((action) => asString(action.apiKey).length > 0)
}

function isPrimaryControl(element: FlatElement): boolean {
  if (element.type === 'SubmitButton' || element.type === 'SearchField') return true
  return element.type === 'Button' && asString(element.props?.variant) === 'primary'
}

/**
 * Primary controls that belong to this Section, not a nested Section.
 */
function primaryIdsInSection(sectionId: string, elements: Record<string, FlatElement>): string[] {
  const ids: string[] = []
  const queue = [...(elements[sectionId]?.children ?? [])]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const element = elements[id]
    if (!element) continue
    if (element.type === 'Section') continue
    if (element.type === 'Modal' || element.type === 'Drawer') continue
    if (isPrimaryControl(element)) ids.push(id)
    queue.push(...(element.children ?? []))
  }
  return ids
}

function ancestorHasType(
  id: string,
  type: string,
  parent: Map<string, string>,
  elements: Record<string, FlatElement>
): boolean {
  let current = parent.get(id)
  while (current) {
    if (elements[current]?.type === type) return true
    current = parent.get(current)
  }
  return false
}

function pageHasReturnNav(spec: Spec, currentPath: string): boolean {
  const elements = elementsOf(spec)
  for (const element of Object.values(elements)) {
    const props = element.props ?? {}
    if (element.type === 'NavLink' && asString(props.to)) return true
    if (
      element.type === 'Button' &&
      (asString(props.navigateTo) || asTruthyFlag(props.clearItem))
    ) {
      return true
    }
    if (element.type === 'WorkingCard' && asString(props.cancelTo)) return true
    if (element.type === 'Tabs') {
      for (const item of parseTabItems(props.items)) {
        if (splitNavTarget(item.path).path !== currentPath) return true
      }
    }
  }
  return false
}

function navigateSuccessTargets(manifest: ArenaGenerativeAppManifest): Set<string> {
  const targets = new Set<string>()
  for (const action of Object.values(manifest.actions)) {
    const navigate = asString(action.onSuccess?.navigate)
    if (navigate) targets.add(splitNavTarget(navigate).path)
  }
  return targets
}

function duplicateOnLoadApiKeyErrors(
  pagePath: string,
  onLoad: string[] | undefined,
  manifest: ArenaGenerativeAppManifest
): string[] {
  if (!onLoad || onLoad.length < 2) return []
  const issues: string[] = []
  const seen = new Map<string, string>()
  for (const actionId of onLoad) {
    const apiKey = asString(manifest.actions[actionId]?.apiKey)
    if (!apiKey) continue
    const previous = seen.get(apiKey)
    if (previous) {
      issues.push(
        `Page "${pagePath}" onLoad runs "${previous}" and "${actionId}" which share API key "${apiKey}". One actionId per job.`
      )
      continue
    }
    seen.set(apiKey, actionId)
  }
  return issues
}

function unboundDynamicErrors(pagePath: string, spec: Spec): string[] {
  const issues: string[] = []
  const elements = elementsOf(spec)
  for (const [id, element] of Object.entries(elements)) {
    const props = element.props ?? {}
    if (asString(props.statePath)) continue
    if (element.type === 'Stat' && isLiteralValue(props.value)) {
      issues.push(
        `Page "${pagePath}" Stat "${id}" hard-codes value and has no statePath. Bind the metric.`
      )
    }
    if (element.type === 'Sparkline' && isLiteralValue(props.values)) {
      issues.push(
        `Page "${pagePath}" Sparkline "${id}" hard-codes values and has no statePath. Bind the series.`
      )
    }
    if (element.type === 'Chart' && (isLiteralValue(props.values) || isLiteralValue(props.categories))) {
      issues.push(
        `Page "${pagePath}" Chart "${id}" hard-codes values and has no statePath. Bind the series.`
      )
    }
  }
  return issues
}

function nestedCardErrors(pagePath: string, spec: Spec): string[] {
  const issues: string[] = []
  const elements = elementsOf(spec)
  const parent = parentByChildId(elements)
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Card') continue
    if (ancestorHasType(id, 'Card', parent, elements)) {
      issues.push(
        `Page "${pagePath}" Card "${id}" is nested inside another Card. Do not wrap a Card in a Card.`
      )
    }
  }
  return issues
}

export interface ExtraPrimarySection {
  sectionId: string
  primaryIds: string[]
}

/**
 * Sections that currently have more than one primary action.
 */
export function extraPrimarySections(spec: Spec): ExtraPrimarySection[] {
  const sections: ExtraPrimarySection[] = []
  const elements = elementsOf(spec)
  for (const [sectionId, element] of Object.entries(elements)) {
    if (element.type !== 'Section') continue
    const primaryIds = primaryIdsInSection(sectionId, elements)
    if (primaryIds.length > 1) {
      sections.push({ sectionId, primaryIds })
    }
  }
  return sections
}

function extraPrimaryErrors(pagePath: string, spec: Spec): string[] {
  return extraPrimarySections(spec).map(
    (section) =>
      `Page "${pagePath}" Section "${section.sectionId}" has more than one primary action (${section.primaryIds.join(', ')}). Keep one of Button variant "primary", SubmitButton, or SearchField.`
  )
}

function tooManyCardsErrors(pagePath: string, spec: Spec): string[] {
  const elements = elementsOf(spec)
  const insideRepeat = idsInsideType(elements, 'Repeat')
  const extra = Object.entries(elements)
    .filter(([id, element]) => element.type === 'Card' && !insideRepeat.has(id))
    .map(([id]) => id)
  if (extra.length > MAX_NON_REPEAT_CARDS_PER_PAGE) {
    return [
      `Page "${pagePath}" has ${extra.length} Cards outside Repeat; at most ${MAX_NON_REPEAT_CARDS_PER_PAGE} are allowed. Put repeating items in Repeat.`,
    ]
  }
  return []
}

function inventedRepresentationTypeErrors(pagePath: string, spec: Spec): string[] {
  const issues: string[] = []
  const elements = elementsOf(spec)
  for (const [id, element] of Object.entries(elements)) {
    const type = element.type
    if (!type || !INVENTED_REPRESENTATION_TYPES.has(type)) continue
    issues.push(
      `Page "${pagePath}" uses "${type}" on "${id}" which is not a catalog type. Represent kanban or timeline with grouped or dated Repeat or Table.`
    )
  }
  return issues
}

function workspaceShellErrors(pagePath: string, spec: Spec): string[] {
  const issues: string[] = []
  const elements = elementsOf(spec)
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Workspace') continue
    const childIds = element.children ?? []
    if (childIds.length < 2) {
      issues.push(
        `Page "${pagePath}" Workspace "${id}" needs navigator and primary children. Add both regions.`
      )
    }
    for (const childId of childIds) {
      if (elements[childId]?.type === 'Workspace') {
        issues.push(
          `Page "${pagePath}" Workspace "${id}" nests another Workspace. Regions use collection, detail, task, results, or content — not a second shell.`
        )
      }
      if (elements[childId]?.type === 'Tabs') {
        issues.push(
          `Page "${pagePath}" Workspace "${id}" uses Tabs for a region. Keep navigator, primary, and inspector visible together.`
        )
      }
    }
  }
  return issues
}

function missingReturnNavErrors(
  pagePath: string,
  spec: Spec,
  entryPath: string,
  navigateTargets: Set<string>
): string[] {
  if (pagePath === entryPath) return []
  if (!navigateTargets.has(pagePath)) return []
  if (pageHasReturnNav(spec, pagePath)) return []
  return [
    `Page "${pagePath}" is an onSuccess.navigate target with no NavLink, Button.navigateTo, clearItem, or Tabs path back. Add a Back control.`,
  ]
}

/**
 * Every blocking host-critic issue on authored pages. Used for the
 * user-facing generate failure after repair turns are spent.
 */
export function hostCriticManifestIssues(
  manifest: ArenaGenerativeAppManifest,
  options: HostCriticOptions = {}
): string[] {
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  const bindingsPresent = hasBindings(manifest)
  const navigateTargets = navigateSuccessTargets(manifest)
  const issues: string[] = []

  for (const [path, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(path)) continue
    issues.push(...duplicateOnLoadApiKeyErrors(path, page.onLoad, manifest))
    if (bindingsPresent) {
      issues.push(...unboundDynamicErrors(path, page.spec))
    }
    issues.push(...nestedCardErrors(path, page.spec))
    issues.push(...extraPrimaryErrors(path, page.spec))
    issues.push(...tooManyCardsErrors(path, page.spec))
    issues.push(...missingReturnNavErrors(path, page.spec, manifest.entryPath, navigateTargets))
    issues.push(...inventedRepresentationTypeErrors(path, page.spec))
    issues.push(...workspaceShellErrors(path, page.spec))
  }

  return issues
}

/**
 * Deterministic quality lint after catalog validation. Returns the first
 * blocking issue, or undefined when the spec is clean. Scoped edits pass
 * `authoredPagePaths` so untouched pages are not re-litigated.
 */
export function hostCriticManifest(
  manifest: ArenaGenerativeAppManifest,
  options: HostCriticOptions = {}
): string | undefined {
  return hostCriticManifestIssues(manifest, options)[0]
}

function compactProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  if (!props) return next
  for (const key of CRITIC_ELEMENT_PROP_KEYS) {
    const value = props[key]
    if (value === undefined || value === null || value === '') continue
    next[key] = value
  }
  return next
}

/**
 * Compact view of authored pages for the LLM critic. Omits theme, copy-heavy
 * props, and pages a scoped edit did not touch.
 */
export function compactManifestForCritic(
  manifest: ArenaGenerativeAppManifest,
  authoredPagePaths?: string[]
): CompactCriticManifest {
  const authored = authoredPagePaths ? new Set(authoredPagePaths) : null
  const pages: CriticPageView[] = []
  for (const [path, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(path)) continue
    const elements = elementsOf(page.spec)
    pages.push({
      path,
      title: page.title,
      ...(page.onLoad && page.onLoad.length > 0 ? { onLoad: page.onLoad } : {}),
      elements: Object.entries(elements).map(([id, element]) => ({
        id,
        type: asString(element.type) || 'Unknown',
        props: compactProps(element.props),
      })),
    })
  }
  return {
    entryPath: manifest.entryPath,
    pages,
    actions: manifest.actions,
  }
}
