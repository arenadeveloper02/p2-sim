import type { Spec } from '@json-render/core'
import { layoutPlansFromBindings } from '@/lib/arena-generative-ui/binding-layout-plan'
import { arenaGenerativeUiCatalog } from '@/lib/arena-generative-ui/catalog'
import { normalizeGeneratedSpec } from '@/lib/arena-generative-ui/normalize-spec'
import { parseArenaGenerativeTheme } from '@/lib/arena-generative-ui/theme'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  type ArenaGenerativePageHint,
  isJsonRenderSpec,
  MAX_PAGE_ON_LOAD_ACTIONS,
  parseTabItems,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'
import { validateManifestBindingLayout } from '@/lib/arena-generative-ui/validate-binding-layout'

interface FlatElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export const GENERATOR_OMITTED_PAGES_ERROR =
  'The generator omitted pages. Retry, or pin a JSON sitemap in Pages.'

export interface ManifestValidationResult {
  success: boolean
  error?: string
  manifest?: ArenaGenerativeAppManifest
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function kebabPagePath(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN.test(slug) ? slug : ''
}

function pathForArrayPage(
  record: Record<string, unknown>,
  index: number,
  used: Set<string>
): string {
  let path = asString(record.path)
  if (!ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN.test(path)) {
    path = kebabPagePath(asString(record.title))
  }
  if (!path) {
    path = index === 0 && !used.has('home') ? 'home' : `page-${index + 1}`
  }
  if (used.has(path)) {
    let suffix = 2
    while (used.has(`${path}-${suffix}`)) {
      suffix += 1
    }
    path = `${path}-${suffix}`
  }
  used.add(path)
  return path
}

/**
 * Models often emit `pages` as an array of `{ path, title, spec }`. Fold that
 * into the path-keyed record the host expects. Missing path uses kebab-case
 * title, else `home` / `page-N`.
 */
function normalizePagesRecord(pagesRaw: unknown): Record<string, unknown> | null {
  if (Array.isArray(pagesRaw)) {
    const pages: Record<string, unknown> = {}
    const used = new Set<string>()
    for (const [index, item] of pagesRaw.entries()) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const path = pathForArrayPage(record, index, used)
      pages[path] = { ...record, path }
    }
    return Object.keys(pages).length > 0 ? pages : null
  }
  if (pagesRaw && typeof pagesRaw === 'object') {
    return pagesRaw as Record<string, unknown>
  }
  return null
}

/**
 * Page paths a spec navigates to. Targets may carry query params for the
 * destination's `onLoad`, so only the path half names a page.
 */
export function collectNavTargets(spec: Spec): string[] {
  const elements = spec.elements as Record<string, FlatElement>
  const targets: string[] = []
  for (const element of Object.values(elements ?? {})) {
    const props = element.props ?? {}
    const to = asString(props.to) || asString(props.navigateTo) || asString(props.cancelTo)
    if (to) {
      targets.push(splitNavTarget(to).path)
    }
    if (element.type === 'Tabs') {
      for (const item of parseTabItems(props.items)) {
        targets.push(splitNavTarget(item.path).path)
      }
    }
  }
  return targets
}

/** Reads a page's `onLoad`, tolerating a single id emitted as a bare string. */
function parseOnLoad(raw: unknown): string[] {
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []
  const ids: string[] = []
  for (const entry of list) {
    const id = asString(entry)
    if (id && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

function collectActionIdsFromSpec(spec: Spec): string[] {
  const elements = spec.elements as Record<string, FlatElement>
  const ids: string[] = []
  for (const element of Object.values(elements ?? {})) {
    const props = element.props ?? {}
    const actionId = asString(props.actionId)
    if (actionId) {
      ids.push(actionId)
    }
  }
  return ids
}

/**
 * SearchField actionId must equal a `manifest.actions` key. The gold example
 * uses `search_companies`; models often emit `company_search` without renaming
 * the actions map. Listing declared keys makes the repair turn explicit.
 */
function unknownActionError(
  path: string,
  actionId: string,
  actions: ArenaGenerativeAppManifest['actions'],
  source: 'page' | 'onLoad'
): string {
  const where =
    source === 'onLoad'
      ? `Page "${path}" onLoad references unknown action "${actionId}"`
      : `Page "${path}" references unknown action "${actionId}"`
  const declared = Object.keys(actions)
  if (declared.length === 0) {
    return `${where}. Add it to manifest.actions with a declared API binding key as apiKey.`
  }
  return `${where}. actionId must match a manifest.actions key exactly (${declared.join(', ')}).`
}

function asTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true'
}

/**
 * Ids of every `SubmitButton` that is neither inside a `Form` nor carries its own
 * `actionId`. Those submit nothing and run nothing, so they render as a dead
 * button. A form-less `SubmitButton` that does carry an `actionId` is fine — the
 * host runs it on click — so it is deliberately not reported here.
 */
function deadSubmitButtonIds(spec: Spec): string[] {
  const elements = (spec.elements ?? {}) as Record<string, FlatElement>
  const insideForm = new Set<string>()
  const queue: string[] = []
  for (const element of Object.values(elements)) {
    if (element.type === 'Form') {
      queue.push(...(element.children ?? []))
    }
  }
  while (queue.length > 0) {
    const id = queue.pop()
    if (!id || insideForm.has(id)) continue
    insideForm.add(id)
    queue.push(...(elements[id]?.children ?? []))
  }
  return Object.entries(elements)
    .filter(
      ([id, element]) =>
        element.type === 'SubmitButton' && !insideForm.has(id) && !asString(element.props?.actionId)
    )
    .map(([id]) => id)
}

/**
 * Ids of every `Button` with no verb — no `actionId`, `navigateTo`, `href`,
 * `selectItem`, `clearItem`, or `setValue`. Chip without `actionId` is display chrome.
 */
function deadButtonIds(spec: Spec): string[] {
  const elements = (spec.elements ?? {}) as Record<string, FlatElement>
  return Object.entries(elements)
    .filter(([, element]) => {
      if (element.type !== 'Button') return false
      const props = element.props ?? {}
      return !(
        asString(props.actionId) ||
        asString(props.navigateTo) ||
        asString(props.href) ||
        asString(props.setValue) ||
        asTruthyFlag(props.selectItem) ||
        asTruthyFlag(props.clearItem)
      )
    })
    .map(([id]) => id)
}

function elementIdsInsideRepeat(spec: Spec): Set<string> {
  const elements = (spec.elements ?? {}) as Record<string, FlatElement>
  const inside = new Set<string>()
  const queue: string[] = []
  for (const element of Object.values(elements)) {
    if (element.type === 'Repeat') {
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

function selectItemError(spec: Spec, pageKey: string): string | undefined {
  const elements = (spec.elements ?? {}) as Record<string, FlatElement>
  const insideRepeat = elementIdsInsideRepeat(spec)
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Button') continue
    const selectItem = element.props?.selectItem === true
    const clearItem = element.props?.clearItem === true
    if (clearItem && selectItem) {
      return `Page "${pageKey}" Button "${id}" sets clearItem and selectItem; Back clears the copied row with clearItem only.`
    }
    if (clearItem && asString(element.props?.actionId)) {
      return `Page "${pageKey}" Button "${id}" sets clearItem and actionId; Back is not an API call.`
    }
    if (!selectItem) continue
    if (asString(element.props?.actionId)) {
      return `Page "${pageKey}" Button "${id}" sets selectItem and actionId; Open a loaded row with selectItem only (no API call).`
    }
    if (!insideRepeat.has(id)) {
      return `Page "${pageKey}" Button "${id}" sets selectItem outside Repeat; selectItem only copies a Repeat row.`
    }
  }
  return undefined
}

function stripActionIds(spec: Spec): void {
  const elements = spec.elements as Record<string, FlatElement>
  for (const element of Object.values(elements ?? {})) {
    if (element.props && asString(element.props.actionId)) {
      element.props.actionId = undefined
    }
  }
}

function walkReachable(
  entryPath: string,
  pages: ArenaGenerativeAppManifest['pages'],
  actions: ArenaGenerativeAppManifest['actions']
): Set<string> {
  const seen = new Set<string>()
  const queue = [entryPath]
  while (queue.length > 0) {
    const path = queue.pop()
    if (!path || seen.has(path)) continue
    seen.add(path)
    const page = pages[path]
    if (!page) continue
    for (const target of collectNavTargets(page.spec)) {
      if (pages[target] && !seen.has(target)) {
        queue.push(target)
      }
    }
    for (const actionId of collectActionIdsFromSpec(page.spec)) {
      const navigate = actions[actionId]?.onSuccess?.navigate
      if (!navigate) continue
      const target = splitNavTarget(navigate).path
      if (pages[target] && !seen.has(target)) {
        queue.push(target)
      }
    }
  }
  return seen
}

/**
 * Validates a generated multi-page manifest against the catalog, declared pages, and API bindings.
 */
export function validateArenaGenerativeManifest(
  raw: unknown,
  options: {
    pageHints?: ArenaGenerativePageHint[]
    apiBindings: ArenaGenerativeApiBinding[]
    entryPath?: string
    /**
     * Pages this reply actually authored. Quality checks that would otherwise
     * reject a pre-existing page run only on these, so a scoped edit is never
     * blocked by a defect on a page it did not touch. Omit to check every page,
     * which is right for a generate or a whole-manifest edit.
     */
    authoredPagePaths?: string[]
  }
): ManifestValidationResult {
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  if (!raw || typeof raw !== 'object') {
    return { success: false, error: 'Manifest must be an object' }
  }

  const candidate = raw as Record<string, unknown>
  const pagesRaw = normalizePagesRecord(candidate.pages)
  const actionsRaw =
    candidate.actions && typeof candidate.actions === 'object' && !Array.isArray(candidate.actions)
      ? (candidate.actions as Record<string, unknown>)
      : {}

  if (!pagesRaw) {
    return {
      success: false,
      error: GENERATOR_OMITTED_PAGES_ERROR,
    }
  }

  const pages: ArenaGenerativeAppManifest['pages'] = {}
  for (const [key, value] of Object.entries(pagesRaw)) {
    if (!ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN.test(key)) {
      return {
        success: false,
        error: `Invalid page path "${key}". Use kebab-case segments like home or results.`,
      }
    }
    if (!value || typeof value !== 'object') {
      return { success: false, error: `Page "${key}" is invalid` }
    }
    const page = value as Record<string, unknown>
    const path = asString(page.path) || key
    if (path !== key) {
      return { success: false, error: `Page key "${key}" must match path "${path}"` }
    }
    const spec = normalizeGeneratedSpec(page.spec)
    if (!spec) {
      return { success: false, error: `Page "${key}" is missing a spec` }
    }
    const validation = arenaGenerativeUiCatalog.validate(spec)
    if (!validation.success || !validation.data || !isJsonRenderSpec(validation.data)) {
      const issueSummary =
        validation.error?.issues
          ?.slice(0, 5)
          .map((issue) => issue.message)
          .join('; ') ?? 'invalid spec'
      return { success: false, error: `Page "${key}" spec failed validation: ${issueSummary}` }
    }
    const onLoad = parseOnLoad(page.onLoad)
    if (onLoad.length > MAX_PAGE_ON_LOAD_ACTIONS) {
      return {
        success: false,
        error: `Page "${key}" declares ${onLoad.length} onLoad actions; at most ${MAX_PAGE_ON_LOAD_ACTIONS} are allowed`,
      }
    }
    const deadSubmits = authored && !authored.has(key) ? [] : deadSubmitButtonIds(validation.data)
    if (deadSubmits.length > 0) {
      return {
        success: false,
        error: `Page "${key}" has a SubmitButton (${deadSubmits.join(', ')}) that is not inside a Form and has no actionId, so it would do nothing. Put it inside the Form it submits, or give it an actionId.`,
      }
    }
    const deadButtons = authored && !authored.has(key) ? [] : deadButtonIds(validation.data)
    if (deadButtons.length > 0) {
      return {
        success: false,
        error: `Page "${key}" has a Button (${deadButtons.join(', ')}) with no actionId, navigateTo, href, selectItem, clearItem, or setValue, so it would do nothing. Give it a verb.`,
      }
    }
    const selectItemIssue =
      authored && !authored.has(key) ? undefined : selectItemError(validation.data, key)
    if (selectItemIssue) {
      return { success: false, error: selectItemIssue }
    }
    pages[key] = {
      path: key,
      title: asString(page.title) || key,
      spec: validation.data,
      ...(onLoad.length > 0 ? { onLoad } : {}),
    }
  }

  const pageKeys = Object.keys(pages)
  if (pageKeys.length === 0) {
    return { success: false, error: 'At least one page is required' }
  }

  const hintedPaths = options.pageHints?.map((hint) => hint.path).filter(Boolean) ?? []
  if (hintedPaths.length > 0) {
    const extra = pageKeys.filter((path) => !hintedPaths.includes(path))
    const missing = hintedPaths.filter((path) => !pages[path])
    if (extra.length > 0) {
      return {
        success: false,
        error: `Generated pages not in the requested list: ${extra.join(', ')}`,
      }
    }
    if (missing.length > 0) {
      return { success: false, error: `Missing requested pages: ${missing.join(', ')}` }
    }
  }

  const entryPath =
    asString(candidate.entryPath) || asString(options.entryPath) || hintedPaths[0] || pageKeys[0]
  if (!pages[entryPath]) {
    return { success: false, error: `entryPath "${entryPath}" is not a generated page` }
  }

  const bindingKeys = new Set(options.apiBindings.map((binding) => binding.key))
  const actions: ArenaGenerativeAppManifest['actions'] = {}
  const reachabilityActions: ArenaGenerativeAppManifest['actions'] = {}
  for (const [actionId, value] of Object.entries(actionsRaw)) {
    if (!value || typeof value !== 'object') {
      return { success: false, error: `Action "${actionId}" is invalid` }
    }
    const action = value as Record<string, unknown>
    const apiKey = asString(action.apiKey)
    const onSuccess =
      action.onSuccess && typeof action.onSuccess === 'object'
        ? (action.onSuccess as Record<string, unknown>)
        : undefined
    const navigate = onSuccess ? asString(onSuccess.navigate) : ''
    if (navigate && !pages[splitNavTarget(navigate).path]) {
      return {
        success: false,
        error: `Action "${actionId}" onSuccess.navigate "${navigate}" is not a page`,
      }
    }
    const parsedAction: ArenaGenerativeAppManifest['actions'][string] = {
      ...(apiKey ? { apiKey } : {}),
      inputMapping:
        action.inputMapping && typeof action.inputMapping === 'object'
          ? (action.inputMapping as Record<string, string>)
          : undefined,
      append: Array.isArray(action.append)
        ? action.append
            .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
            .map((key) => key.trim())
        : undefined,
      onSuccess: onSuccess
        ? {
            navigate: navigate || undefined,
            setState:
              onSuccess.setState && typeof onSuccess.setState === 'object'
                ? (onSuccess.setState as Record<string, unknown>)
                : undefined,
          }
        : undefined,
      onError:
        action.onError && typeof action.onError === 'object'
          ? {
              setState:
                (action.onError as Record<string, unknown>).setState &&
                typeof (action.onError as Record<string, unknown>).setState === 'object'
                  ? ((action.onError as Record<string, unknown>).setState as Record<
                      string,
                      unknown
                    >)
                  : undefined,
            }
          : undefined,
    }
    if (!apiKey) {
      actions[actionId] = parsedAction
      if (navigate && pages[splitNavTarget(navigate).path]) {
        reachabilityActions[actionId] = parsedAction
      }
      continue
    }
    if (!bindingKeys.has(apiKey)) {
      if (bindingKeys.size === 0) continue
      return {
        success: false,
        error: `Action "${actionId}" references unknown API key "${apiKey}"`,
      }
    }
    actions[actionId] = parsedAction
  }
  const navigationOnly = bindingKeys.size === 0 && Object.keys(actions).length === 0

  for (const [path, page] of Object.entries(pages)) {
    for (const target of collectNavTargets(page.spec)) {
      if (!pages[target]) {
        return {
          success: false,
          error: `Page "${path}" navigates to unknown path "${target}"`,
        }
      }
    }
    for (const actionId of collectActionIdsFromSpec(page.spec)) {
      if (navigationOnly) {
        continue
      }
      if (!actions[actionId]) {
        return {
          success: false,
          error: unknownActionError(path, actionId, actions, 'page'),
        }
      }
    }
    if (navigationOnly) {
      page.onLoad = undefined
      continue
    }
    for (const actionId of page.onLoad ?? []) {
      if (!actions[actionId]) {
        return {
          success: false,
          error: unknownActionError(path, actionId, actions, 'onLoad'),
        }
      }
    }
  }

  const reachable = walkReachable(entryPath, pages, navigationOnly ? reachabilityActions : actions)
  if (navigationOnly) {
    for (const page of Object.values(pages)) {
      stripActionIds(page.spec)
    }
  }
  const orphans = pageKeys.filter((path) => !reachable.has(path))
  if (orphans.length > 0) {
    return {
      success: false,
      error: `Unreachable pages from entryPath "${entryPath}": ${orphans.join(', ')}`,
    }
  }

  const theme = parseArenaGenerativeTheme(candidate.theme)

  const manifest: ArenaGenerativeAppManifest = {
    entryPath,
    pages,
    actions,
    ...(theme ? { theme } : {}),
  }
  const layoutError = validateManifestBindingLayout(
    manifest,
    layoutPlansFromBindings(options.apiBindings),
    { authoredPagePaths: options.authoredPagePaths }
  )
  if (layoutError) {
    return { success: false, error: layoutError }
  }

  return {
    success: true,
    manifest,
  }
}
