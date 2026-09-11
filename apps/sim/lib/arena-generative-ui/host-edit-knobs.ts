/**
 * Closed host paint/layout knobs from ordinary-language Requested Changes.
 * Applied after the spec LLM (or instead of it when the edit is paint-only).
 */

import type { Spec } from '@json-render/core'
import { generateShortId } from '@sim/utils/id'
import type { ArenaGenerativeEditScope } from '@/lib/arena-generative-ui/edit-scope'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import type { ArenaGenerativeTheme } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

export type HostCollectionColumns = '1' | '2' | '3' | '4'

export interface HostCollectionDensity {
  columns: HostCollectionColumns
  pageHint?: string
  nearestFromPixels?: boolean
}

export interface HostEditKnobs {
  collectionDensity?: HostCollectionDensity
  headingScale?: 'smaller'
  textContrast?: 'strong' | 'default'
  loadingChrome?: 'skeleton' | 'spinner'
  emptyWhilePending?: boolean
}

interface FlatElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

const WORD_COLUMNS: Record<string, HostCollectionColumns> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
}

const CARD_TEMPLATE_TYPES = new Set(['Card', 'Stat'])
const OPEN_EDIT =
  /\b(move|separate page|new page|add (?:a )?page|remove (?:the )?page|bind|actionid|navigate|rewrite|rebuild|from scratch|back (?:button|cta)|form field|search box)\b/i
const PAGE_ON = /on the ["']([^"']+)["'] page/i
const PAGE_BARE = /\b(?:history|home|results|generator)\b/i
const PX_CARDS = /(?:cards?.{0,24}(\d{2,3})\s*px|(\d{2,3})\s*px\s+cards?)/i
const TITLE_QUOTED = /(?:title[d]?|named)\s+["']([^"']+)["']/i
const SPLIT_RESULTS =
  /\b(?:move|put|show)\b.{0,80}\bresults\b.{0,80}\b(?:separate|new|another)\s+page\b/i

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toColumns(raw: string | undefined): HostCollectionColumns | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower in WORD_COLUMNS) return WORD_COLUMNS[lower]
  if (raw === '1' || raw === '2' || raw === '3' || raw === '4') return raw
  return undefined
}

function pageHintFrom(text: string): string | undefined {
  const quoted = text.match(PAGE_ON)
  if (quoted?.[1]) return quoted[1].trim()
  const bare = text.match(PAGE_BARE)
  return bare?.[0]?.toLowerCase()
}

/**
 * Reads closed host knobs from User Input / Requested Changes.
 */
export function parseHostEditKnobs(text: string): HostEditKnobs {
  const knobs: HostEditKnobs = {}
  const trimmed = text.trim()
  if (!trimmed) return knobs

  const perRow =
    trimmed.match(
      /\b(\d|one|two|three|four)(?:\s+\w+){0,3}\s+cards?\s+(?:in|per)\s+(?:a\s+)?row\b/i
    ) ??
    trimmed.match(/\b(\d|one|two|three|four)(?:\s*-\s*)?up\s+cards?\b/i) ??
    trimmed.match(
      /\b(?:use|show|render)\s+(\d|two|three|four)\s+columns?\s+for\s+(?:the\s+)?(?:history|run\s+)?cards?\b/i
    )
  const stacked = /\b(?:one|1)\s+card\s+(?:in|per)\s+(?:a\s+)?row\b/i.test(trimmed)
    || /\bstack\s+(?:the\s+)?cards\b/i.test(trimmed)
  const pxCards = trimmed.match(PX_CARDS)
  const pxWidth = pxCards?.[1] ?? pxCards?.[2]
  if (stacked) {
    knobs.collectionDensity = { columns: '1', pageHint: pageHintFrom(trimmed) }
  } else if (perRow) {
    const columns = toColumns(perRow[1])
    if (columns) {
      knobs.collectionDensity = { columns, pageHint: pageHintFrom(trimmed) }
    }
  } else if (pxWidth) {
    knobs.collectionDensity = {
      columns: '2',
      pageHint: pageHintFrom(trimmed),
      nearestFromPixels: true,
    }
  }

  if (
    /\b(?:title|heading|page\s+title).{0,48}(?:too big|too large|huge|smaller|normal size|appropriate size)\b/i.test(
      trimmed
    ) ||
    /\b(?:use|make).{0,24}(?:appropriate|normal|smaller)\s+(?:size|title|heading)\b/i.test(trimmed)
  ) {
    knobs.headingScale = 'smaller'
  }

  if (
    /\b(?:text|copy|type|ink).{0,24}(?:darker|more contrast|stronger)\b/i.test(trimmed) ||
    /\b(?:darker|more contrast).{0,24}(?:text|copy)\b/i.test(trimmed)
  ) {
    knobs.textContrast = 'strong'
  } else if (/\blighter\s+text\b/i.test(trimmed)) {
    knobs.textContrast = 'default'
  }

  if (
    /\b(?:circular|spinner|spinning)\s+(?:loader|loading|spinner)\b/i.test(trimmed) ||
    /\bdon'?t show (?:the )?skeleton\b/i.test(trimmed) ||
    /\bno skeleton\b/i.test(trimmed)
  ) {
    knobs.loadingChrome = 'spinner'
  } else if (/\buse (?:the )?skeletons?\b/i.test(trimmed)) {
    knobs.loadingChrome = 'skeleton'
  }

  if (
    /\b(?:hide|don'?t show)\b.{0,80}\b(?:no results|empty)\b.{0,80}\b(?:fetch|load|pending)/i.test(
      trimmed
    )
  ) {
    knobs.emptyWhilePending = true
  }

  return knobs
}

function hasHostKnobs(knobs: HostEditKnobs): boolean {
  return Boolean(
    knobs.collectionDensity ||
      knobs.headingScale ||
      knobs.textContrast ||
      knobs.loadingChrome ||
      knobs.emptyWhilePending
  )
}

/**
 * True when Requested Changes is only host paint/layout knobs — skip the spec LLM.
 */
export function isPaintOnlyEdit(
  instructions: string,
  scope: ArenaGenerativeEditScope | null
): boolean {
  const text = instructions.trim()
  if (!text) return false
  if (scope) {
    if (scope.touchesActions || !scope.pageSetStable) return false
  }
  const knobs = parseHostEditKnobs(text)
  if (!hasHostKnobs(knobs)) return false
  if (OPEN_EDIT.test(text) || SPLIT_RESULTS.test(text)) return false
  return true
}

function specElements(spec: Spec): Record<string, FlatElement> {
  return (spec.elements ?? {}) as Record<string, FlatElement>
}

function parentByChild(elements: Record<string, FlatElement>): Map<string, string> {
  const parents = new Map<string, string>()
  for (const [id, element] of Object.entries(elements)) {
    for (const childId of element.children ?? []) {
      parents.set(childId, id)
    }
  }
  return parents
}

function subtreeHasCardTemplate(
  id: string,
  elements: Record<string, FlatElement>,
  seen = new Set<string>()
): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  const element = elements[id]
  if (!element) return false
  if (CARD_TEMPLATE_TYPES.has(element.type ?? '')) return true
  return (element.children ?? []).some((childId) =>
    subtreeHasCardTemplate(childId, elements, seen)
  )
}

function isCardCollectionRepeat(id: string, elements: Record<string, FlatElement>): boolean {
  const element = elements[id]
  if (element?.type !== 'Repeat') return false
  return (element.children ?? []).some((childId) => subtreeHasCardTemplate(childId, elements))
}

function kebabPath(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/**
 * Quoted title + “separate page” for results. Used by land-check, not host invent.
 */
export function parseSplitResultsAsk(text: string): { title: string; path: string } | null {
  if (!SPLIT_RESULTS.test(text) && !/\bresults\b.{0,40}\b(?:separate|new)\s+page\b/i.test(text)) {
    return null
  }
  const quoted = text.match(TITLE_QUOTED)
  const title = quoted?.[1]?.trim() || 'Requested info'
  const path = kebabPath(title)
  if (!path) return null
  return { title, path }
}

function resolvePagePaths(manifest: ArenaGenerativeAppManifest, hint?: string): string[] {
  const all = Object.keys(manifest.pages)
  if (!hint) return all
  const needle = hint.toLowerCase()
  const matched = all.filter((path) => {
    const page = manifest.pages[path]
    const title = (page?.title ?? '').toLowerCase()
    return path.toLowerCase() === needle || title === needle || path.toLowerCase().includes(needle)
      || title.includes(needle)
  })
  return matched.length > 0 ? matched : all
}

function invertRepeatGrid(repeatId: string, elements: Record<string, FlatElement>): boolean {
  const repeat = elements[repeatId]
  const childIds = repeat.children ?? []
  if (childIds.length !== 1) return false
  const gridId = childIds[0]
  const grid = elements[gridId]
  if (grid?.type !== 'Grid') return false
  const parents = parentByChild(elements)
  const parentId = parents.get(repeatId)
  if (!parentId) return false
  const parent = elements[parentId]
  elements[repeatId] = { ...repeat, children: [...(grid.children ?? [])] }
  elements[gridId] = { ...grid, children: [repeatId] }
  elements[parentId] = {
    ...parent,
    children: (parent.children ?? []).map((id) => (id === repeatId ? gridId : id)),
  }
  return true
}

function setGridColumns(element: FlatElement, columns: HostCollectionColumns): FlatElement {
  if (columns === '1') {
    return {
      ...element,
      type: 'Stack',
      props: {
        direction: 'vertical',
        gap: element.props?.gap ?? 'md',
        showWhen: element.props?.showWhen ?? null,
      },
    }
  }
  return {
    ...element,
    type: 'Grid',
    props: {
      ...element.props,
      columns,
      gap: element.props?.gap ?? 'md',
    },
  }
}

function wrapRepeatInGrid(
  repeatId: string,
  columns: HostCollectionColumns,
  elements: Record<string, FlatElement>
): boolean {
  invertRepeatGrid(repeatId, elements)
  const parents = parentByChild(elements)
  const parentId = parents.get(repeatId)
  if (!parentId) return false
  const parent = elements[parentId]
  if (parent.type === 'Grid' || (parent.type === 'Stack' && (parent.children ?? []).length === 1)) {
    elements[parentId] = setGridColumns(parent, columns)
    return true
  }
  const gridId = `host-grid-${generateShortId(8)}`
  const repeat = elements[repeatId]
  elements[gridId] = {
    type: columns === '1' ? 'Stack' : 'Grid',
    props:
      columns === '1'
        ? { direction: 'vertical', gap: 'md', showWhen: repeat.props?.showWhen ?? null }
        : { columns, gap: 'md', showWhen: repeat.props?.showWhen ?? null },
    children: [repeatId],
  }
  elements[parentId] = {
    ...parent,
    children: (parent.children ?? []).map((id) => (id === repeatId ? gridId : id)),
  }
  return true
}

function applyCollectionDensity(
  spec: Spec,
  columns: HostCollectionColumns
): { spec: Spec; changed: boolean } {
  const elements = structuredClone(specElements(spec))
  let changed = false
  for (const id of Object.keys(elements)) {
    if (!isCardCollectionRepeat(id, elements)) continue
    if (wrapRepeatInGrid(id, columns, elements)) changed = true
  }
  return changed ? { spec: { ...spec, elements }, changed } : { spec, changed: false }
}

function isCssLength(value: string): boolean {
  return /\d/.test(value)
}

function applyHeadingScale(spec: Spec): { spec: Spec; changed: boolean } {
  const elements = { ...specElements(spec) }
  let changed = false
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Heading') continue
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
    if (!touched) continue
    elements[id] = { ...element, props }
    changed = true
  }
  return changed ? { spec: { ...spec, elements }, changed } : { spec, changed: false }
}

function pageHasCardRepeatInColumns(
  spec: Spec,
  columns: HostCollectionColumns
): boolean {
  const elements = specElements(spec)
  const parents = parentByChild(elements)
  for (const [id, element] of Object.entries(elements)) {
    if (!isCardCollectionRepeat(id, elements)) continue
    const parent = elements[parents.get(id) ?? '']
    if (columns === '1') {
      if (parent?.type === 'Stack' || parent?.type === 'Section') return true
      continue
    }
    if (parent?.type === 'Grid' && asString(parent.props?.columns) === columns) return true
  }
  return false
}

function pageHasScaledHeadings(spec: Spec): boolean {
  const elements = specElements(spec)
  return !Object.values(elements).some((element) => {
    if (element.type !== 'Heading') return false
    if (asString(element.props?.level) === 'h1') return true
    const size = asString(element.props?.size)
    return Boolean(size && isCssLength(size))
  })
}

function pageHasBackTo(spec: Spec, origin: string): boolean {
  for (const element of Object.values(specElements(spec))) {
    if (element.type === 'NavLink' && asString(element.props?.to) === origin) return true
    if (element.type === 'Button' && asString(element.props?.navigateTo) === origin) return true
  }
  return false
}

/**
 * Inserts a Back NavLink on a results page when the model omitted it.
 */
export function ensureBackNavLink(
  spec: Spec,
  originPath: string
): { spec: Spec; changed: boolean } {
  if (pageHasBackTo(spec, originPath)) return { spec, changed: false }
  const elements = structuredClone(specElements(spec))
  const sectionId = Object.keys(elements).find((id) => elements[id]?.type === 'Section')
  const parentId = sectionId ?? spec.root
  const parent = elements[parentId]
  if (!parent) return { spec, changed: false }
  const backId = `host-back-${generateShortId(8)}`
  elements[backId] = {
    type: 'NavLink',
    props: { label: 'Back', to: originPath },
    children: [],
  }
  elements[parentId] = {
    ...parent,
    children: [backId, ...(parent.children ?? [])],
  }
  return { spec: { ...spec, elements }, changed: true }
}

export interface ApplyHostEditKnobsOptions {
  userInput?: string
  authoredPagePaths?: string[]
}

/**
 * Patches theme and card-collection layout from parsed knobs.
 */
export function applyHostEditKnobs(
  manifest: ArenaGenerativeAppManifest,
  knobs: HostEditKnobs,
  options: ApplyHostEditKnobsOptions = {}
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  if (!hasHostKnobs(knobs)) {
    return { manifest, adoptedChanges }
  }

  let next = manifest
  let pages = manifest.pages
  let pagesChanged = false

  if (knobs.collectionDensity) {
    const paths = resolvePagePaths(manifest, knobs.collectionDensity.pageHint)
    const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
    for (const path of paths) {
      if (authored && !authored.has(path)) continue
      const page = pages[path]
      if (!page) continue
      const applied = applyCollectionDensity(page.spec, knobs.collectionDensity.columns)
      if (!applied.changed) continue
      if (!pagesChanged) pages = { ...pages }
      pagesChanged = true
      pages[path] = { ...page, spec: applied.spec }
    }
    if (pagesChanged) {
      next = { ...next, pages }
      const asked = knobs.collectionDensity.nearestFromPixels
        ? 'Pixel card width is not honored.'
        : `Show ${knobs.collectionDensity.columns} card(s) per row.`
      adoptedChanges.push({
        code: knobs.collectionDensity.nearestFromPixels ? 'edit-nearest' : 'collection-density',
        asked,
        adopted:
          knobs.collectionDensity.columns === '1'
            ? 'Stacked Repeat cards in one column.'
            : `Wrapped Repeat in Grid columns ${knobs.collectionDensity.columns}.`,
      })
    }
  }

  if (knobs.headingScale) {
    const paths = resolvePagePaths(next, pageHintFrom(options.userInput ?? ''))
    const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
    let headingChanged = false
    for (const path of paths) {
      if (authored && !authored.has(path)) continue
      const page = pages[path]
      if (!page) continue
      const applied = applyHeadingScale(page.spec)
      if (!applied.changed) continue
      if (!pagesChanged && !headingChanged) pages = { ...pages }
      pagesChanged = true
      headingChanged = true
      pages[path] = { ...page, spec: applied.spec }
    }
    if (headingChanged) {
      next = { ...next, pages }
      adoptedChanges.push({
        code: 'heading-scale',
        asked: 'Title is too big; use an appropriate size.',
        adopted: 'Demoted extra Heading h1 to the host type scale (h2).',
      })
    }
  }

  const themePatch: ArenaGenerativeTheme = { ...next.theme }
  let themeChanged = false
  if (knobs.textContrast) {
    themePatch.ink = knobs.textContrast
    themeChanged = true
    adoptedChanges.push({
      code: 'text-contrast',
      asked: 'Make the text a bit darker.',
      adopted:
        knobs.textContrast === 'strong'
          ? 'Set app-wide theme ink to strong (not a per-card color).'
          : 'Restored default theme ink.',
    })
  }
  if (knobs.loadingChrome) {
    themePatch.loadingChrome = knobs.loadingChrome
    themeChanged = true
    adoptedChanges.push({
      code: 'loading-chrome',
      asked:
        knobs.loadingChrome === 'spinner'
          ? 'Use a circular loader instead of skeletons.'
          : 'Use skeleton loaders.',
      adopted:
        knobs.loadingChrome === 'spinner'
          ? 'Pending regions paint a circular loader.'
          : 'Pending regions paint skeletons.',
    })
  }
  if (knobs.emptyWhilePending) {
    adoptedChanges.push({
      code: 'empty-while-pending',
      asked: 'Hide no-results while data is loading.',
      adopted: 'Host hides EmptyState and emptyText while the bound path is pending.',
    })
  }
  if (themeChanged) {
    next = { ...next, theme: themePatch }
  }

  return { manifest: next, adoptedChanges }
}

/**
 * What still does not match the ask after host apply / spec LLM.
 */
export function hostEditLandMisses(
  manifest: ArenaGenerativeAppManifest,
  userInput: string,
  knobs: HostEditKnobs = parseHostEditKnobs(userInput)
): string[] {
  const misses: string[] = []
  if (knobs.collectionDensity) {
    const paths = resolvePagePaths(manifest, knobs.collectionDensity.pageHint)
    const landed = paths.some((path) => {
      const spec = manifest.pages[path]?.spec
      return spec ? pageHasCardRepeatInColumns(spec, knobs.collectionDensity!.columns) : false
    })
    if (!landed) {
      misses.push(
        `Card collections are not in ${
          knobs.collectionDensity.columns === '1'
            ? 'a single column'
            : `Grid columns ${knobs.collectionDensity.columns}`
        }.`
      )
    }
  }
  if (knobs.headingScale) {
    const paths = resolvePagePaths(manifest, pageHintFrom(userInput))
    const landed = paths.every((path) => {
      const spec = manifest.pages[path]?.spec
      return spec ? pageHasScaledHeadings(spec) : true
    })
    if (!landed) misses.push('Page titles still use Heading h1 or a CSS font size.')
  }
  if (knobs.textContrast && manifest.theme?.ink !== knobs.textContrast) {
    misses.push(`Theme ink is not ${knobs.textContrast}.`)
  }
  if (knobs.loadingChrome && manifest.theme?.loadingChrome !== knobs.loadingChrome) {
    misses.push(`Loading chrome is not ${knobs.loadingChrome}.`)
  }
  const split = parseSplitResultsAsk(userInput)
  if (split) {
    const dest =
      manifest.pages[split.path] ??
      Object.values(manifest.pages).find(
        (page) => page.title.toLowerCase() === split.title.toLowerCase()
      )
    if (!dest) {
      misses.push(`Missing results page titled "${split.title}" (path ${split.path}).`)
    } else if (!pageHasBackTo(dest.spec, manifest.entryPath)) {
      misses.push(`Page "${dest.path}" has no Back to ${manifest.entryPath}.`)
    }
  }
  return misses
}

/**
 * After a land-check miss, insert Back when the destination page exists.
 */
export function applySplitResultsBack(
  manifest: ArenaGenerativeAppManifest,
  userInput: string
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const split = parseSplitResultsAsk(userInput)
  if (!split) return { manifest, adoptedChanges: [] }
  const dest =
    manifest.pages[split.path] ??
    Object.values(manifest.pages).find(
      (page) => page.title.toLowerCase() === split.title.toLowerCase()
    )
  if (!dest) return { manifest, adoptedChanges: [] }
  const inserted = ensureBackNavLink(dest.spec, manifest.entryPath)
  if (!inserted.changed) return { manifest, adoptedChanges: [] }
  return {
    manifest: {
      ...manifest,
      pages: {
        ...manifest.pages,
        [dest.path]: { ...dest, spec: inserted.spec },
      },
    },
    adoptedChanges: [
      {
        code: 'split-results-back',
        asked: `Add Back from "${dest.title}" to the origin page.`,
        adopted: `Inserted a Back NavLink to "${manifest.entryPath}".`,
      },
    ],
  }
}

/**
 * Repair-turn copy when the ask did not land. Counts as one existing repair attempt.
 */
export function formatLandCheckRepair(misses: readonly string[]): string {
  return misses.map((miss, index) => `${index + 1}. ${miss}`).join('\n')
}
