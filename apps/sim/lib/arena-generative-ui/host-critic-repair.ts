import type { Spec } from '@json-render/core'
import { omit } from '@sim/utils/object'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import {
  type SanitizeHostOwnedManifestOptions,
  sanitizeHostOwnedManifest,
} from '@/lib/arena-generative-ui/strip-host-owned-chrome'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import {
  extraDisplayHeadingIds,
  extraPrimarySections,
  inventedRepresentationEntries,
  MAX_NON_REPEAT_CARDS_PER_PAGE,
  measureOnlyWideSections,
  navigateSuccessTargets,
  nonRepeatCardIds,
  pageHasReturnNav,
  unboundLiteralWidgetIds,
  workspaceShellIssueIds,
} from '@/lib/arena-generative-ui/ui-critic'

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
    element.type = 'TextInput'
    element.props = omit(element.props ?? {}, ['actionId'])
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isCssLength(value: string): boolean {
  return /\d/.test(value)
}

function demoteDisplayHeading(element: FlatElement): boolean {
  if (element.type !== 'Heading') return false
  const props = { ...element.props }
  let touched = false
  if (asString(props.level) === 'h1') {
    props.level = 'h2'
    touched = true
  }
  if (asString(props.color)) {
    props.color = null
    touched = true
  }
  const size = asString(props.size)
  if (size && isCssLength(size)) {
    props.size = null
    touched = true
  }
  if (!touched) return false
  element.props = props
  return true
}

function leftAlignPageHeadersInSection(
  sectionId: string,
  elements: Record<string, FlatElement>
): boolean {
  const section = elements[sectionId]
  if (!section) return false
  let changed = false
  const visit = (ids: string[]) => {
    for (const id of ids) {
      const element = elements[id]
      if (!element) continue
      if (element.type === 'PageHeader' && asString(element.props?.align) === 'center') {
        element.props = { ...element.props, align: 'start' }
        changed = true
      }
      visit(element.children ?? [])
    }
  }
  visit(section.children ?? [])
  return changed
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

/**
 * Cards that wrap another Card (directly or through Grid/Stack/Repeat).
 * Unwrap these grouping surfaces; keep Repeat item Cards.
 */
function nestedCardWrapperIds(elements: Record<string, FlatElement>): string[] {
  const parent = parentByChildId(elements)
  const wrappers = new Set<string>()
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Card') continue
    let current = parent.get(id)
    while (current) {
      if (elements[current]?.type === 'Card') {
        wrappers.add(current)
        break
      }
      current = parent.get(current)
    }
  }
  return [...wrappers]
}

function unusedElementId(base: string, elements: Record<string, FlatElement>): string {
  if (!elements[base]) return base
  let index = 2
  while (elements[`${base}_${index}`]) {
    index += 1
  }
  return `${base}_${index}`
}

function insertCopyElement(
  id: string,
  type: 'Heading' | 'Text',
  text: string,
  elements: Record<string, FlatElement>
): string {
  const nextId = unusedElementId(id, elements)
  elements[nextId] =
    type === 'Heading'
      ? { type: 'Heading', props: { text, level: 'h2', color: null }, children: [] }
      : {
          type: 'Text',
          props: { text, color: null, size: null, dateFormat: null, numberFormat: null },
          children: [],
        }
  return nextId
}

/**
 * Turns a grouping Card into a Stack so descendant Cards are no longer nested.
 */
function unwrapCardToStack(id: string, elements: Record<string, FlatElement>): void {
  const card = elements[id]
  if (!card || card.type !== 'Card') return
  const title = asString(card.props?.title)
  const subtitle = asString(card.props?.subtitle)
  const description = asString(card.props?.description)
  const footerText = asString(card.props?.footerText)
  const prefix: string[] = []
  if (title) {
    prefix.push(insertCopyElement(`${id}_heading`, 'Heading', title, elements))
  }
  if (subtitle) {
    prefix.push(insertCopyElement(`${id}_subtitle`, 'Text', subtitle, elements))
  }
  if (description) {
    prefix.push(insertCopyElement(`${id}_description`, 'Text', description, elements))
  }
  const suffix: string[] = []
  if (footerText) {
    suffix.push(insertCopyElement(`${id}_footer`, 'Text', footerText, elements))
  }
  card.type = 'Stack'
  card.props = {
    direction: 'vertical',
    gap: 'md',
    align: 'stretch',
    justify: 'start',
    wrap: false,
    showWhen: card.props?.showWhen ?? null,
  }
  card.children = [...prefix, ...(card.children ?? []), ...suffix]
}

function flattenNestedCards(elements: Record<string, FlatElement>): string[] {
  const unwrapped: string[] = []
  const limit = Object.keys(elements).length
  for (let pass = 0; pass < limit; pass++) {
    const wrappers = nestedCardWrapperIds(elements)
    if (wrappers.length === 0) break
    for (const id of wrappers) {
      unwrapCardToStack(id, elements)
      unwrapped.push(id)
    }
  }
  return unwrapped
}

function asStack(element: FlatElement): void {
  element.type = 'Stack'
  element.props = {
    direction: 'vertical',
    gap: 'md',
    align: 'stretch',
    justify: 'start',
    wrap: false,
    showWhen: element.props?.showWhen ?? null,
  }
}

function rewriteInventedType(element: FlatElement, type: string): 'Chart' | 'Repeat' {
  const props = element.props ?? {}
  const seriesLike =
    type === 'Filmstrip' || type === 'HorizontalScroll'
      ? Boolean(
          asString(props.series) ||
            asString(props.categoryField) ||
            asString(props.statePath) ||
            Array.isArray(props.values) ||
            Array.isArray(props.categories)
        )
      : false
  if (seriesLike) {
    element.type = 'Chart'
    element.props = {
      statePath: asString(props.statePath) || null,
      chartType: 'line',
      categoryField: asString(props.categoryField) || 'time',
      series: asString(props.series) || 'value',
      showWhen: props.showWhen ?? null,
    }
    return 'Chart'
  }
  element.type = 'Repeat'
  element.props = {
    statePath: asString(props.statePath) || 'items',
    emptyText: asString(props.emptyText) || 'None',
    showWhen: props.showWhen ?? null,
  }
  return 'Repeat'
}

function dropElement(id: string, spec: Spec): void {
  const elements = elementsOf(spec)
  for (const element of Object.values(elements)) {
    if (element.children?.includes(id)) {
      element.children = element.children.filter((child) => child !== id)
    }
  }
  spec.elements = omit(elements, [id]) as Spec['elements']
}

function firstSectionId(elements: Record<string, FlatElement>): string | undefined {
  return Object.keys(elements).find((id) => elements[id]?.type === 'Section')
}

function manifestHasBindings(manifest: ArenaGenerativeAppManifest): boolean {
  return Object.values(manifest.actions).some(
    (action) => typeof action.apiKey === 'string' && action.apiKey.trim().length > 0
  )
}

function insertBackButton(spec: Spec, pagePath: string, entryPath: string): string | undefined {
  const elements = elementsOf(spec)
  if (pageHasReturnNav(spec, pagePath)) return undefined
  const sectionId = firstSectionId(elements)
  const parent = sectionId ? elements[sectionId] : elements[spec.root]
  if (!parent) return undefined
  const backId = unusedElementId('back', elements)
  elements[backId] = {
    type: 'Button',
    props: {
      label: 'Back',
      variant: 'ghost',
      navigateTo: entryPath,
      actionId: null,
    },
    children: [],
  }
  parent.children = [backId, ...(parent.children ?? [])]
  return backId
}

/**
 * Nearest host fix for proveable critic issues and host-owned chrome the
 * model emitted anyway. Nested Cards unwrap to Stack (Repeat item Cards stay).
 * Extra primary CTAs keep one (SubmitButton, then SearchField, then the first
 * primary Button) and demote the rest so generate can succeed. Invented boards,
 * unbound optional Stats, extra grouping Cards, missing Back, and illegal
 * Workspace shells are rewritten rather than rejected.
 */
export function repairHostCriticExtras(
  manifest: ArenaGenerativeAppManifest,
  options: SanitizeHostOwnedManifestOptions = {}
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const sanitized = sanitizeHostOwnedManifest(manifest, options)
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = [...sanitized.adoptedChanges]
  let next: ArenaGenerativeAppManifest | undefined =
    sanitized.adoptedChanges.length > 0 ? sanitized.manifest : undefined
  manifest = sanitized.manifest
  const entryPath = options.entryPath ?? manifest.entryPath
  const navigateTargets = navigateSuccessTargets(manifest)
  const bindingsPresent = manifestHasBindings(manifest)

  for (const [pagePath, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(pagePath)) continue
    const extras = extraPrimarySections(page.spec)
    const measureSections = measureOnlyWideSections(page.spec)
    const displayHeadings = extraDisplayHeadingIds(page.spec)
    const nestedWrappers = nestedCardWrapperIds(elementsOf(page.spec))
    const invented = inventedRepresentationEntries(page.spec)
    const shellIssues = workspaceShellIssueIds(page.spec)
    const overflowCards = nonRepeatCardIds(page.spec)
    const unboundIds = bindingsPresent ? unboundLiteralWidgetIds(page.spec) : []
    const needsBack =
      pagePath !== entryPath &&
      navigateTargets.has(pagePath) &&
      !pageHasReturnNav(page.spec, pagePath)
    if (
      extras.length === 0 &&
      measureSections.length === 0 &&
      displayHeadings.length === 0 &&
      nestedWrappers.length === 0 &&
      invented.length === 0 &&
      unboundIds.length === 0 &&
      overflowCards.length <= MAX_NON_REPEAT_CARDS_PER_PAGE &&
      !needsBack &&
      shellIssues.shortShells.length === 0 &&
      shellIssues.nestedWorkspaces.length === 0 &&
      shellIssues.tabRegions.length === 0
    ) {
      continue
    }
    next ??= structuredClone(manifest)
    const spec = next.pages[pagePath]?.spec
    if (!spec) continue
    const elements = elementsOf(spec)

    const nestedWorkspaceIds = workspaceShellIssueIds(spec).nestedWorkspaces
    if (nestedWorkspaceIds.length > 0) {
      for (const id of nestedWorkspaceIds) {
        const element = elements[id]
        if (element) asStack(element)
      }
      adoptedChanges.push({
        code: 'workspace-shell',
        asked: `Page "${pagePath}" nested Workspace regions (${nestedWorkspaceIds.join(', ')}).`,
        adopted: `Unwrapped ${nestedWorkspaceIds.map((id) => `"${id}"`).join(', ')} from Workspace to Stack.`,
      })
    }
    const tabRegionIds = workspaceShellIssueIds(spec).tabRegions
    if (tabRegionIds.length > 0) {
      for (const id of tabRegionIds) {
        const element = elements[id]
        if (element) asStack(element)
      }
      adoptedChanges.push({
        code: 'workspace-shell',
        asked: `Page "${pagePath}" used Tabs as a Workspace region (${tabRegionIds.join(', ')}).`,
        adopted: `Changed ${tabRegionIds.map((id) => `"${id}"`).join(', ')} from Tabs to Stack.`,
      })
    }
    const shortShells = workspaceShellIssueIds(spec).shortShells
    if (shortShells.length > 0) {
      for (const id of shortShells) {
        const element = elements[id]
        if (element) asStack(element)
      }
      adoptedChanges.push({
        code: 'workspace-shell',
        asked: `Page "${pagePath}" Workspace (${shortShells.join(', ')}) was missing navigator and primary.`,
        adopted: `Changed ${shortShells.map((id) => `"${id}"`).join(', ')} from Workspace to Stack.`,
      })
    }

    const inventedNow = inventedRepresentationEntries(spec)
    if (inventedNow.length > 0) {
      const rewritten = inventedNow.map(({ id, type }) => {
        const element = elements[id]
        const adoptedType = element ? rewriteInventedType(element, type) : 'Repeat'
        return `"${id}" (${type} → ${adoptedType})`
      })
      adoptedChanges.push({
        code: 'invented-type',
        asked: `Page "${pagePath}" used non-catalog types (${inventedNow.map((entry) => entry.type).join(', ')}).`,
        adopted: `Rewrote ${rewritten.join(', ')}.`,
      })
    }

    const flattened = flattenNestedCards(elements)
    if (flattened.length > 0) {
      adoptedChanges.push({
        code: 'nested-card',
        asked: `Page "${pagePath}" nested Cards inside ${flattened.map((id) => `"${id}"`).join(', ')}.`,
        adopted: `Unwrapped ${flattened.map((id) => `"${id}"`).join(', ')} from Card to Stack so item Cards are not nested.`,
      })
    }
    for (const section of extraPrimarySections(spec)) {
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
    for (const section of measureOnlyWideSections(spec)) {
      const element = elements[section.sectionId]
      if (!element) continue
      element.props = { ...element.props, width: 'narrow' }
      leftAlignPageHeadersInSection(section.sectionId, elements)
      adoptedChanges.push({
        code: 'task-measure',
        asked: `Section "${section.sectionId}" on page "${pagePath}" was a form or search hero on a wide measure.`,
        adopted: `Set Section width to narrow and left-aligned the PageHeader.`,
      })
    }
    const demotedHeadings: string[] = []
    for (const id of extraDisplayHeadingIds(spec)) {
      const element = elements[id]
      if (!element) continue
      if (demoteDisplayHeading(element)) demotedHeadings.push(`"${id}"`)
    }
    if (demotedHeadings.length > 0) {
      adoptedChanges.push({
        code: 'heading-scale',
        asked: `Page "${pagePath}" had a display Heading beside PageHeader.`,
        adopted: `Demoted ${demotedHeadings.join(', ')} to the host type scale (h2).`,
      })
    }

    if (bindingsPresent) {
      const dropped = unboundLiteralWidgetIds(spec)
      if (dropped.length > 0) {
        for (const id of dropped) dropElement(id, spec)
        adoptedChanges.push({
          code: 'unbound-metric',
          asked: `Page "${pagePath}" hard-coded Stat/Chart/Sparkline values (${dropped.join(', ')}).`,
          adopted: `Dropped ${dropped.map((id) => `"${id}"`).join(', ')} — bind a host key or omit the widget.`,
        })
      }
    }

    const overflow = nonRepeatCardIds(spec)
    if (overflow.length > MAX_NON_REPEAT_CARDS_PER_PAGE) {
      const extra = overflow.slice(MAX_NON_REPEAT_CARDS_PER_PAGE)
      for (const id of extra) {
        const element = elementsOf(spec)[id]
        if (element?.type === 'Card') unwrapCardToStack(id, elementsOf(spec))
      }
      adoptedChanges.push({
        code: 'collection-cards',
        asked: `Page "${pagePath}" had ${overflow.length} Cards outside Repeat.`,
        adopted: `Unwrapped ${extra.map((id) => `"${id}"`).join(', ')} from Card to Stack.`,
      })
    }

    if (needsBack) {
      const backId = insertBackButton(spec, pagePath, entryPath)
      if (backId) {
        adoptedChanges.push({
          code: 'missing-back',
          asked: `Page "${pagePath}" is an onSuccess.navigate target with no Back.`,
          adopted: `Added ghost Button "${backId}" navigateTo "${entryPath}".`,
        })
      }
    }
  }

  return { manifest: next ?? manifest, adoptedChanges }
}
