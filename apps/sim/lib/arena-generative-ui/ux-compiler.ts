import type { Spec } from '@json-render/core'
import { parseShowWhen } from '@/lib/arena-generative-ui/form-fields'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
  ArenaGenerativePageManifest,
} from '@/lib/arena-generative-ui/types'
import {
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  specHasSamePageSelectItem,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'
import { UX_DEFAULTS } from '@/lib/arena-generative-ui/ux-defaults'

export type ArenaGenerativeAsyncKind = 'query' | 'mutation' | 'longRunning'

export type ArenaGenerativeFallbackLoading = 'skeleton' | 'status'

export interface ArenaGenerativeUxActionPlan {
  kind: ArenaGenerativeAsyncKind
  confirm: boolean
  retry: boolean
}

export interface ArenaGenerativeUxPlan {
  actions: Record<string, ArenaGenerativeUxActionPlan>
  fallbackLoading: Record<string, ArenaGenerativeFallbackLoading>
}

export interface CompileGenerativeUxResult {
  pages: Record<string, ArenaGenerativePageManifest>
  uxPlan: ArenaGenerativeUxPlan
}

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

const EXPLICIT_LOADING_TYPES = new Set([
  'Skeleton',
  'Spinner',
  'ProgressBar',
  'ProgressSteps',
  'WorkingCard',
])
const RELOCATABLE_LOADING_TYPES = new Set([
  'ProgressBar',
  'ProgressSteps',
  'Spinner',
  'WorkingCard',
])
const BOUND_LOADING_TYPES = new Set(['Table', 'Repeat', 'Stat', 'KeyValue', 'DataText'])
const ACTION_ID_PROP_TYPES = new Set(['Form', 'SubmitButton', 'Button', 'SearchField', 'Chip'])
const LIST_WRAPPER_TYPES = new Set(['Grid', 'Stack', 'Section'])

/** Element key for compiler-injected pending status. Must not collide with model keys. */
export const UX_COMPILER_STATUS_KEY = 'ux-compiler-status'

/** Element key for compiler-injected same-page Open Back. Must not collide with model keys. */
export const UX_COMPILER_SELECT_BACK_KEY = 'ux-compiler-select-back'

const SHOW_WHEN_LIST_HIDDEN = `!${ARENA_GENERATIVE_SELECTED_ID_KEY}`
const SHOW_WHEN_DETAIL_VISIBLE = ARENA_GENERATIVE_SELECTED_ID_KEY

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function showWhenHas(
  props: Record<string, unknown> | undefined,
  op: 'truthy' | 'falsy',
  name: string
): boolean {
  return parseShowWhen(props?.showWhen).some((clause) => clause.name === name && clause.op === op)
}

function showWhenBlank(props: Record<string, unknown> | undefined): boolean {
  return parseShowWhen(props?.showWhen).length === 0
}

function setShowWhen(element: SpecElement, showWhen: string): SpecElement {
  return {
    ...element,
    props: { ...element.props, showWhen },
  }
}

function parentByChild(elements: Record<string, SpecElement>): Map<string, string> {
  const parents = new Map<string, string>()
  for (const [id, element] of Object.entries(elements)) {
    for (const childId of element.children ?? []) {
      parents.set(childId, id)
    }
  }
  return parents
}

function ancestorIds(id: string, parents: Map<string, string>): string[] {
  const ids: string[] = []
  let current = parents.get(id)
  while (current) {
    ids.push(current)
    current = parents.get(current)
  }
  return ids
}

function isSamePageSelectButton(element: SpecElement, pagePath: string): boolean {
  if (element.type !== 'Button' || element.props?.selectItem !== true) return false
  const navigateTo = asString(element.props?.navigateTo)
  if (!navigateTo) return true
  return splitNavTarget(navigateTo).path === pagePath
}

function repeatIdsWithSamePageSelect(
  elements: Record<string, SpecElement>,
  parents: Map<string, string>,
  pagePath: string
): Set<string> {
  const ids = new Set<string>()
  for (const [id, element] of Object.entries(elements)) {
    if (!isSamePageSelectButton(element, pagePath)) continue
    for (const ancestorId of [id, ...ancestorIds(id, parents)]) {
      if (elements[ancestorId]?.type === 'Repeat') ids.add(ancestorId)
    }
  }
  return ids
}

function subtreeHasRepeat(
  id: string,
  elements: Record<string, SpecElement>,
  repeatIds: Set<string>
): boolean {
  if (repeatIds.has(id)) return true
  for (const childId of elements[id]?.children ?? []) {
    if (subtreeHasRepeat(childId, elements, repeatIds)) return true
  }
  return false
}

function isListOnlyContainer(
  id: string,
  elements: Record<string, SpecElement>,
  repeatIds: Set<string>
): boolean {
  if (repeatIds.has(id)) return true
  const element = elements[id]
  if (!element || !LIST_WRAPPER_TYPES.has(element.type ?? '')) return false
  const children = element.children ?? []
  if (children.length === 0) return false
  return children.every((childId) => {
    const child = elements[childId]
    if (!child) return false
    if (EXPLICIT_LOADING_TYPES.has(child.type ?? '') || child.type === 'EmptyState') return true
    return isListOnlyContainer(childId, elements, repeatIds)
  })
}

function isDetailDataText(element: SpecElement): boolean {
  if (element.type !== 'DataText') return false
  const statePath = asString(element.props?.statePath)
  return statePath === 'content' || statePath.startsWith('selected.')
}

function specHasClearItemBack(elements: Record<string, SpecElement>, pagePath: string): boolean {
  for (const element of Object.values(elements)) {
    if (element.type === 'Button' && element.props?.clearItem === true) return true
    if (element.type === 'Button' && element.props?.selectItem === true) continue
    if (element.type === 'Button' && asString(element.props?.navigateTo)) {
      if (splitNavTarget(asString(element.props?.navigateTo)).path === pagePath) return true
    }
    if (element.type === 'NavLink' && asString(element.props?.to)) {
      if (splitNavTarget(asString(element.props?.to)).path === pagePath) return true
    }
  }
  return false
}

function specElements(spec: Spec): Record<string, SpecElement> {
  const elements = spec.elements
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) {
    return {}
  }
  return elements as Record<string, SpecElement>
}

/**
 * True when the spec already has a pending surface (explicit loader or a bound
 * region the renderer auto-skeletons). Overlay must not add a second one.
 */
export function specHasLoadingSurface(spec: Spec): boolean {
  for (const element of Object.values(specElements(spec))) {
    const type = element.type ?? ''
    if (EXPLICIT_LOADING_TYPES.has(type)) return true
    if (BOUND_LOADING_TYPES.has(type) && asString(element.props?.statePath)) return true
  }
  return false
}

function actionIdsInSpec(spec: Spec): string[] {
  const ids: string[] = []
  for (const element of Object.values(specElements(spec))) {
    if (!ACTION_ID_PROP_TYPES.has(element.type ?? '')) continue
    const actionId = asString(element.props?.actionId)
    if (actionId) ids.push(actionId)
  }
  return ids
}

/**
 * Infers how the host should treat an action. `onLoad` is a query; streaming or
 * workflow bindings are long-running; everything else is a mutation.
 */
export function inferAsyncKind(params: {
  usedOnLoad: boolean
  binding?: Pick<ArenaGenerativeApiBinding, 'kind' | 'stream'>
}): ArenaGenerativeAsyncKind {
  if (params.usedOnLoad) return 'query'
  if (params.binding?.stream === true || params.binding?.kind === 'workflow') return 'longRunning'
  return 'mutation'
}

function bindingByKey(
  bindings: ArenaGenerativeApiBinding[]
): Map<string, ArenaGenerativeApiBinding> {
  return new Map(bindings.map((binding) => [binding.key, binding]))
}

function onLoadActionIds(manifest: ArenaGenerativeAppManifest): Set<string> {
  const ids = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    for (const actionId of page.onLoad ?? []) {
      ids.add(actionId)
    }
  }
  return ids
}

function destructiveActionIds(manifest: ArenaGenerativeAppManifest): Set<string> {
  const ids = new Set<string>()
  if (!UX_DEFAULTS.Button.confirmIfDestructive) return ids
  for (const page of Object.values(manifest.pages)) {
    for (const element of Object.values(specElements(page.spec))) {
      if (element.type !== 'Button') continue
      if (asString(element.props?.variant) !== 'destructive') continue
      const actionId = asString(element.props?.actionId)
      if (actionId) ids.add(actionId)
    }
  }
  return ids
}

function navigatePath(target: string | undefined): string {
  if (!target) return ''
  return splitNavTarget(target).path
}

/**
 * Destinations of every CTA on this page, or null when the page has no CTA or
 * any CTA stays on the same page.
 */
function navigateFirstDestinations(
  spec: Spec,
  actionNavigate: Record<string, string>
): string[] | null {
  const actionIds = actionIdsInSpec(spec)
  if (actionIds.length === 0) return null
  const dests: string[] = []
  for (const actionId of actionIds) {
    const dest = navigatePath(actionNavigate[actionId])
    if (!dest) return null
    dests.push(dest)
  }
  return [...new Set(dests)]
}

function collectRelocatableLoaderIds(spec: Spec): string[] {
  const elements = specElements(spec)
  const ids: string[] = []
  const visit = (id: string) => {
    const element = elements[id]
    if (!element) return
    if (RELOCATABLE_LOADING_TYPES.has(element.type ?? '') && id !== UX_COMPILER_STATUS_KEY) {
      ids.push(id)
    }
    for (const childId of element.children ?? []) {
      visit(childId)
    }
  }
  if (spec.root) visit(spec.root)
  return ids
}

function stripElements(spec: Spec, ids: readonly string[]): Spec {
  const remove = new Set(ids)
  const next: Record<string, SpecElement> = {}
  for (const [key, element] of Object.entries(specElements(spec))) {
    if (remove.has(key)) continue
    next[key] = {
      ...element,
      children: (element.children ?? []).filter((childId) => !remove.has(childId)),
    }
  }
  return { ...spec, elements: next }
}

function uniqueElementKey(elements: Record<string, SpecElement>, preferred: string): string {
  if (!elements[preferred]) return preferred
  let suffix = 1
  let key = `relocated-${preferred}`
  while (elements[key]) {
    suffix += 1
    key = `relocated-${preferred}-${suffix}`
  }
  return key
}

function attachElements(spec: Spec, incoming: Array<{ key: string; element: SpecElement }>): Spec {
  if (incoming.length === 0) return spec
  const parentId = findInsertParentId(spec)
  const elements = { ...specElements(spec) }
  if (!parentId || !elements[parentId]) return spec
  const insertedIds: string[] = []
  for (const { key, element } of incoming) {
    const nextKey = uniqueElementKey(elements, key)
    elements[nextKey] = structuredClone(element)
    insertedIds.push(nextKey)
  }
  const parent = elements[parentId]
  elements[parentId] = {
    ...parent,
    children: [...insertedIds, ...(parent.children ?? [])],
  }
  return { ...spec, elements }
}

/**
 * Moves ProgressBar / ProgressSteps / Spinner / WorkingCard off a form whose CTAs all
 * navigate away, onto each destination that has no pending surface yet.
 */
export function relocateNavigateFirstLoaders(
  pages: Record<string, ArenaGenerativePageManifest>,
  actions: ArenaGenerativeAppManifest['actions']
): Record<string, ArenaGenerativePageManifest> {
  const actionNavigate: Record<string, string> = {}
  for (const [actionId, action] of Object.entries(actions)) {
    const dest = navigatePath(action.onSuccess?.navigate)
    if (dest) actionNavigate[actionId] = dest
  }

  const nextPages: Record<string, ArenaGenerativePageManifest> = {}
  for (const [path, page] of Object.entries(pages)) {
    nextPages[path] = { ...page, spec: structuredClone(page.spec) }
  }

  const moves: Array<{ dests: string[]; loaders: Array<{ key: string; element: SpecElement }> }> =
    []
  for (const [path, page] of Object.entries(nextPages)) {
    const dests = navigateFirstDestinations(page.spec, actionNavigate)
    if (!dests) continue
    const loaderIds = collectRelocatableLoaderIds(page.spec)
    if (loaderIds.length === 0) continue
    const elements = specElements(page.spec)
    const loaders = loaderIds.flatMap((id) => {
      const element = elements[id]
      return element ? [{ key: id, element }] : []
    })
    nextPages[path] = { ...page, spec: stripElements(page.spec, loaderIds) }
    moves.push({ dests, loaders })
  }

  for (const move of moves) {
    for (const dest of move.dests) {
      const destPage = nextPages[dest]
      if (!destPage || specHasLoadingSurface(destPage.spec)) continue
      nextPages[dest] = {
        ...destPage,
        spec: attachElements(destPage.spec, move.loaders),
      }
    }
  }

  return nextPages
}

/**
 * Pages that can show pending UX: onLoad, navigate-first destinations, or
 * same-page CTAs.
 */
export function pagesNeedingPendingChrome(manifest: ArenaGenerativeAppManifest): Set<string> {
  const needed = new Set<string>()
  for (const [path, page] of Object.entries(manifest.pages)) {
    if ((page.onLoad ?? []).length > 0) needed.add(path)
  }
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const dest = navigatePath(action.onSuccess?.navigate)
    if (dest) {
      needed.add(dest)
      continue
    }
    for (const [path, page] of Object.entries(manifest.pages)) {
      if (actionIdsInSpec(page.spec).includes(actionId)) {
        needed.add(path)
      }
    }
  }
  return needed
}

function findInsertParentId(spec: Spec): string | null {
  const root = spec.root
  const elements = specElements(spec)
  const rootElement = elements[root]
  if (!rootElement) return null
  for (const childId of rootElement.children ?? []) {
    if (elements[childId]?.type === 'Section') return childId
  }
  return root
}

function injectStatusSpinner(spec: Spec): Spec {
  const elements = specElements(spec)
  if (elements[UX_COMPILER_STATUS_KEY]) return spec
  const parentId = findInsertParentId(spec)
  if (!parentId || !elements[parentId]) return spec
  const parent = elements[parentId]
  const nextElements: Record<string, SpecElement> = { ...elements }
  nextElements[UX_COMPILER_STATUS_KEY] = {
    type: 'Spinner',
    props: { label: 'Working…' },
    children: [],
  }
  nextElements[parentId] = {
    ...parent,
    children: [UX_COMPILER_STATUS_KEY, ...(parent.children ?? [])],
  }
  return {
    ...spec,
    elements: nextElements,
  }
}

/**
 * True when this page can be pending: it loads data on arrival, is a
 * navigate-first destination, or hosts a same-page CTA.
 */
export function pageNeedsPendingChromeFromConfig(params: {
  pagePath: string
  spec: Spec
  onLoadIds?: string[]
  actionNavigate?: Record<string, string>
}): boolean {
  if ((params.onLoadIds ?? []).length > 0) return true
  const dests = Object.values(params.actionNavigate ?? {}).map((target) => navigatePath(target))
  if (dests.includes(params.pagePath)) return true
  return actionIdsInSpec(params.spec).some((actionId) => !params.actionNavigate?.[actionId])
}

export interface CompileGenerativePageSpecOptions {
  needsPendingChrome: boolean
}

/**
 * Overlay a single page spec. Returns a clone; injects indeterminate status
 * only when the page can be pending and has no loading surface.
 */
export function compileGenerativePageSpec(
  spec: Spec,
  options: CompileGenerativePageSpecOptions
): { spec: Spec; injected: boolean } {
  const cloned = structuredClone(spec)
  if (!options.needsPendingChrome || specHasLoadingSurface(cloned)) {
    return { spec: cloned, injected: false }
  }
  const next = injectStatusSpinner(cloned)
  const injected = Boolean(specElements(next)[UX_COMPILER_STATUS_KEY])
  return { spec: next, injected }
}

function planActions(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[]
): Record<string, ArenaGenerativeUxActionPlan> {
  const byKey = bindingByKey(bindings)
  const onLoadIds = onLoadActionIds(manifest)
  const confirmIds = destructiveActionIds(manifest)
  const plan: Record<string, ArenaGenerativeUxActionPlan> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    plan[actionId] = {
      kind: inferAsyncKind({
        usedOnLoad: onLoadIds.has(actionId),
        binding: byKey.get(action.apiKey),
      }),
      confirm: confirmIds.has(actionId),
      retry: !confirmIds.has(actionId),
    }
  }
  return plan
}

/**
 * Fills missing same-page Open chrome: hide the list while a row is selected,
 * show content DataText only then, and add a ghost clearItem Back if none exists.
 * No-op when the spec has no same-page selectItem, or when those props are already set.
 * Never invents a DataText.
 */
export function injectSamePageSelectChrome(spec: Spec, pagePath: string): Spec {
  const cloned = structuredClone(spec)
  if (!specHasSamePageSelectItem(cloned, pagePath)) return cloned
  const elements = specElements(cloned)
  const parents = parentByChild(elements)
  const repeatIds = repeatIdsWithSamePageSelect(elements, parents, pagePath)
  if (repeatIds.size === 0) return cloned

  for (const repeatId of repeatIds) {
    const chain = [repeatId, ...ancestorIds(repeatId, parents)]
    if (
      chain.some((id) =>
        showWhenHas(elements[id]?.props, 'falsy', ARENA_GENERATIVE_SELECTED_ID_KEY)
      )
    ) {
      continue
    }
    const wrapperId = chain.find(
      (id) =>
        id !== repeatId &&
        LIST_WRAPPER_TYPES.has(elements[id]?.type ?? '') &&
        showWhenBlank(elements[id]?.props) &&
        isListOnlyContainer(id, elements, repeatIds)
    )
    const targetId = wrapperId ?? (showWhenBlank(elements[repeatId]?.props) ? repeatId : undefined)
    if (!targetId || !elements[targetId]) continue
    elements[targetId] = setShowWhen(elements[targetId], SHOW_WHEN_LIST_HIDDEN)
  }

  const detailIds: string[] = []
  for (const [id, element] of Object.entries(elements)) {
    if (!isDetailDataText(element)) continue
    if (ancestorIds(id, parents).some((ancestorId) => elements[ancestorId]?.type === 'Repeat')) {
      continue
    }
    const chain = [id, ...ancestorIds(id, parents)]
    if (
      chain.some((chainId) =>
        showWhenHas(elements[chainId]?.props, 'truthy', ARENA_GENERATIVE_SELECTED_ID_KEY)
      )
    ) {
      continue
    }
    const sectionId = chain.find(
      (chainId) =>
        elements[chainId]?.type === 'Section' &&
        showWhenBlank(elements[chainId]?.props) &&
        !subtreeHasRepeat(chainId, elements, repeatIds)
    )
    const targetId = sectionId ?? (showWhenBlank(element.props) ? id : undefined)
    if (!targetId || !elements[targetId]) continue
    elements[targetId] = setShowWhen(elements[targetId], SHOW_WHEN_DETAIL_VISIBLE)
    detailIds.push(targetId)
  }

  if (!specHasClearItemBack(elements, pagePath) && !elements[UX_COMPILER_SELECT_BACK_KEY]) {
    const insertParentId =
      detailIds
        .map((id) => (elements[id]?.type === 'Section' ? id : parents.get(id)))
        .find((id): id is string => Boolean(id && elements[id])) ?? findInsertParentId(cloned)
    if (!insertParentId) return { ...cloned, elements }
    const parent = elements[insertParentId]
    if (!parent) return { ...cloned, elements }
    const backKey = uniqueElementKey(elements, UX_COMPILER_SELECT_BACK_KEY)
    elements[backKey] = {
      type: 'Button',
      props: {
        label: 'Back',
        clearItem: true,
        variant: 'ghost',
        showWhen: SHOW_WHEN_DETAIL_VISIBLE,
      },
      children: [],
    }
    const beforeId = detailIds.find((id) => (parent.children ?? []).includes(id))
    const children = [...(parent.children ?? [])]
    const insertAt = beforeId ? Math.max(children.indexOf(beforeId), 0) : 0
    children.splice(insertAt, 0, backKey)
    elements[insertParentId] = { ...parent, children }
  }

  return { ...cloned, elements }
}

/**
 * Compiles a semantic manifest into in-memory page specs plus a UX plan.
 * Never mutates the input. Well-wired pages stay deep-equal to a clone.
 */
export function compileGenerativeUx(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[] = []
): CompileGenerativeUxResult {
  const needed = pagesNeedingPendingChrome(manifest)
  const relocated = relocateNavigateFirstLoaders(manifest.pages, manifest.actions)
  const fallbackLoading: Record<string, ArenaGenerativeFallbackLoading> = {}
  const pages: Record<string, ArenaGenerativePageManifest> = {}
  for (const [path, page] of Object.entries(relocated)) {
    const withSelectChrome = injectSamePageSelectChrome(page.spec, path)
    const compiled = compileGenerativePageSpec(withSelectChrome, {
      needsPendingChrome: needed.has(path),
    })
    pages[path] = {
      ...page,
      spec: compiled.spec,
    }
    if (compiled.injected) {
      fallbackLoading[path] = 'status'
    }
  }
  return {
    pages,
    uxPlan: {
      actions: planActions(manifest, bindings),
      fallbackLoading,
    },
  }
}

/**
 * One compiled page from a stored (uncompiled) manifest. Preview compiles the
 * full draft on the client; published apps compile here so loader relocation
 * is not lost when the host only fetches one page.
 */
export function compiledPageFromManifest(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[],
  path: string
): ArenaGenerativePageManifest | undefined {
  if (!manifest.pages[path]) return undefined
  return compileGenerativeUx(manifest, bindings).pages[path]
}
