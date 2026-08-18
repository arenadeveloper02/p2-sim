import type { Spec } from '@json-render/core'
import { arenaGenerativeUiCatalog } from '@/lib/arena-generative-ui/catalog'
import { normalizeGeneratedSpec } from '@/lib/arena-generative-ui/normalize-spec'
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
function collectNavTargets(spec: Spec): string[] {
  const elements = spec.elements as Record<string, FlatElement>
  const targets: string[] = []
  for (const element of Object.values(elements ?? {})) {
    const props = element.props ?? {}
    const to = asString(props.to) || asString(props.navigateTo)
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
  }
): ManifestValidationResult {
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
  const navigationOnly = bindingKeys.size === 0
  const reachabilityActions: ArenaGenerativeAppManifest['actions'] = {}
  for (const [actionId, value] of Object.entries(actionsRaw)) {
    if (navigationOnly) {
      if (value && typeof value === 'object') {
        const onSuccess = (value as Record<string, unknown>).onSuccess
        const navigate =
          onSuccess && typeof onSuccess === 'object'
            ? asString((onSuccess as Record<string, unknown>).navigate)
            : ''
        if (navigate && pages[splitNavTarget(navigate).path]) {
          reachabilityActions[actionId] = { apiKey: actionId, onSuccess: { navigate } }
        }
      }
      continue
    }
    if (!value || typeof value !== 'object') {
      return { success: false, error: `Action "${actionId}" is invalid` }
    }
    const action = value as Record<string, unknown>
    const apiKey = asString(action.apiKey)
    if (!apiKey) {
      return { success: false, error: `Action "${actionId}" is missing apiKey` }
    }
    if (!bindingKeys.has(apiKey)) {
      return {
        success: false,
        error: `Action "${actionId}" references unknown API key "${apiKey}"`,
      }
    }
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
    actions[actionId] = {
      apiKey,
      inputMapping:
        action.inputMapping && typeof action.inputMapping === 'object'
          ? (action.inputMapping as Record<string, string>)
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
  }

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
          error: `Page "${path}" references unknown action "${actionId}"`,
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
          error: `Page "${path}" onLoad references unknown action "${actionId}"`,
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

  return {
    success: true,
    manifest: {
      entryPath,
      pages,
      actions,
    },
  }
}
