import type { Spec } from '@json-render/core'
import { arenaGenerativeUiCatalog } from '@/lib/arena-generative-ui/catalog'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  type ArenaGenerativePageHint,
  isJsonRenderSpec,
} from '@/lib/arena-generative-ui/types'

interface FlatElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export interface ManifestValidationResult {
  success: boolean
  error?: string
  manifest?: ArenaGenerativeAppManifest
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSpec(raw: unknown): Spec | null {
  if (!raw || typeof raw !== 'object') return null
  const spec = structuredClone(raw) as Spec
  const elements = spec.elements as Record<string, FlatElement> | undefined
  if (!elements || typeof elements !== 'object') return spec
  for (const element of Object.values(elements)) {
    if (element && typeof element === 'object' && !Array.isArray(element.children)) {
      element.children = []
    }
  }
  return spec
}

function collectNavTargets(spec: Spec): string[] {
  const elements = spec.elements as Record<string, FlatElement>
  const targets: string[] = []
  for (const element of Object.values(elements ?? {})) {
    const props = element.props ?? {}
    const to = asString(props.to) || asString(props.navigateTo)
    if (to) {
      targets.push(to)
    }
  }
  return targets
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
      if (navigate && pages[navigate] && !seen.has(navigate)) {
        queue.push(navigate)
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
  const pagesRaw = candidate.pages
  const actionsRaw =
    candidate.actions && typeof candidate.actions === 'object' && !Array.isArray(candidate.actions)
      ? (candidate.actions as Record<string, unknown>)
      : {}

  if (!pagesRaw || typeof pagesRaw !== 'object' || Array.isArray(pagesRaw)) {
    return { success: false, error: 'manifest.pages must be an object keyed by page path' }
  }

  const pages: ArenaGenerativeAppManifest['pages'] = {}
  for (const [key, value] of Object.entries(pagesRaw as Record<string, unknown>)) {
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
    const spec = normalizeSpec(page.spec)
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
    pages[key] = {
      path: key,
      title: asString(page.title) || key,
      spec: validation.data,
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
        if (navigate && pages[navigate]) {
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
    if (navigate && !pages[navigate]) {
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
