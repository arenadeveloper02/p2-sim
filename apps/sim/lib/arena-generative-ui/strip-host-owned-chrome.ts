/**
 * Silently drops duplicate wait / notify / Refresh chrome and unrequested extra
 * pages so generate/edit succeed and only host chrome paints.
 */

import type { Spec } from '@json-render/core'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import { requestSignalsHistory } from '@/lib/arena-generative-ui/planner-contract'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'
import { splitNavTarget } from '@/lib/arena-generative-ui/types'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export interface StripHostOwnedChromeContext {
  pagePath: string
  onLoadActionIds?: ReadonlySet<string>
  actionApiKeys?: Readonly<Record<string, string>>
}

export interface SanitizeHostOwnedManifestOptions {
  authoredPagePaths?: string[]
  allowedPagePaths?: string[]
  entryPath?: string
  userInput?: string
  apiBindings?: readonly ArenaGenerativeApiBinding[]
  /** When true, do not heuristically drop dashboard/history pages (edit may add them). */
  isPreserveEdit?: boolean
}

const FORM_TYPES = new Set(['Form', 'SubmitButton'])
const WAIT_STRIP_TYPES = new Set(['Spinner', 'ProgressBar', 'ProgressSteps'])
const PROSE_LEAVES = new Set(['output', 'content', 'body', 'text', 'message', 'assistantContent'])
const ITEM_PROSE_TEMPLATE = /\{item\.(output|content|body|text|message|assistantContent)(?:\|[^}]*)?\}/gi
const ELAPSED_COPY = /elapsed|seconds remaining|time remaining/i
const TOAST_COPY = /\b(saved|success|successfully|copied|deleted|complete[d]?)\b/i
const ALERT_COPY = /\b(error|failed|failure|retry|something went wrong|unable to|went wrong)\b/i
const DELETE_COPY = /\b(delete|remove|disconnect|confirm)\b/i
const REFRESH_LABEL = /^(refresh|reload)(\s+(list|data|page))?$/i
const CANCEL_LABEL = /^cancel$/i
const INVENTED_PAGE = /^(dashboard|stats|statistics|settings|profile|analytics)$/i
const COMPILER_STATUS_KEY = 'ux-compiler-status'
const OVERLAY_FLAGS = new Set(['creating', 'editing'])

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function specElements(spec: Spec): Record<string, SpecElement> {
  const elements = spec.elements
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) {
    return {}
  }
  return elements as Record<string, SpecElement>
}

function elementCopy(element: SpecElement): string {
  const props = element.props ?? {}
  return [
    asString(props.label),
    asString(props.title),
    asString(props.text),
    asString(props.message),
    asString(props.body),
    asString(props.description),
  ]
    .filter(Boolean)
    .join(' ')
}

function specHasForm(elements: Record<string, SpecElement>): boolean {
  return Object.values(elements).some((element) => FORM_TYPES.has(element.type ?? ''))
}

function descendantsOf(elements: Record<string, SpecElement>, rootId: string): string[] {
  const ids: string[] = []
  const queue = [...(elements[rootId]?.children ?? [])]
  while (queue.length > 0) {
    const id = queue.pop()
    if (!id || ids.includes(id)) continue
    ids.push(id)
    queue.push(...(elements[id]?.children ?? []))
  }
  return ids
}

function itemPathLeaf(statePath: string): string {
  if (!statePath.startsWith('item.')) return ''
  const field = statePath.slice('item.'.length)
  return field.split('.')[0] ?? ''
}

function isProseItemPath(statePath: string): boolean {
  const leaf = itemPathLeaf(statePath)
  if (PROSE_LEAVES.has(leaf)) return true
  const last = statePath.split('.').pop() ?? ''
  return statePath.startsWith('item.') && PROSE_LEAVES.has(last) && leaf === 'output'
}

function stripProseTemplates(value: string): string {
  return value.replace(ITEM_PROSE_TEMPLATE, '').replace(/\s{2,}/g, ' ').trim()
}

function buttonHasVerb(props: Record<string, unknown> | undefined): boolean {
  return Boolean(
    asString(props?.actionId) ||
      asString(props?.navigateTo) ||
      asString(props?.href) ||
      asString(props?.to) ||
      props?.selectItem === true ||
      props?.clearItem === true ||
      asString(props?.setValue) ||
      props?.copyContent === true ||
      props?.downloadPdf === true
  )
}

function showWhenNames(showWhen: unknown): string[] {
  const raw = asString(showWhen)
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim().replace(/^!/, '').split(/[!=]/)[0]?.trim() ?? '')
    .filter(Boolean)
}

function isOverlayModal(element: SpecElement): boolean {
  return showWhenNames(element.props?.showWhen).some((name) => OVERLAY_FLAGS.has(name))
}

function subtreeHasDestructive(elements: Record<string, SpecElement>, rootId: string): boolean {
  for (const id of [rootId, ...descendantsOf(elements, rootId)]) {
    const element = elements[id]
    if (element?.type === 'Button' && asString(element.props?.variant) === 'destructive') {
      return true
    }
  }
  return false
}

function stripElements(spec: Spec, ids: ReadonlySet<string>): Spec {
  if (ids.size === 0) return spec
  const next: Record<string, SpecElement> = {}
  for (const [key, element] of Object.entries(specElements(spec))) {
    if (ids.has(key)) continue
    next[key] = {
      ...element,
      children: (element.children ?? []).filter((childId) => !ids.has(childId)),
    }
  }
  return { ...spec, elements: next }
}

function collectFormWaitIds(
  elements: Record<string, SpecElement>,
  hasForm: boolean
): string[] {
  if (!hasForm) return []
  const ids: string[] = []
  for (const [id, element] of Object.entries(elements)) {
    if (id === COMPILER_STATUS_KEY) continue
    const type = element.type ?? ''
    if (type === 'Spinner' || type === 'ProgressSteps') {
      ids.push(id)
      continue
    }
    if (type === 'ProgressBar' && !asString(element.props?.statePath)) {
      ids.push(id)
      continue
    }
    if (type === 'Button' && CANCEL_LABEL.test(asString(element.props?.label)) && !buttonHasVerb(element.props)) {
      ids.push(id)
      continue
    }
    if (
      (type === 'Text' || type === 'Heading') &&
      ELAPSED_COPY.test(elementCopy(element))
    ) {
      ids.push(id)
    }
  }
  return ids
}

function collectNotifyIds(elements: Record<string, SpecElement>): string[] {
  const ids: string[] = []
  for (const [id, element] of Object.entries(elements)) {
    const type = element.type ?? ''
    const copy = elementCopy(element)
    if (type === 'Toast' && TOAST_COPY.test(copy)) {
      ids.push(id)
      continue
    }
    if (type === 'Alert' && ALERT_COPY.test(copy)) {
      ids.push(id)
      continue
    }
    if (type === 'Modal' && !isOverlayModal(element)) {
      if (subtreeHasDestructive(elements, id) || DELETE_COPY.test(copy)) {
        ids.push(id)
      }
    }
  }
  return ids
}

function collectRefreshIds(
  elements: Record<string, SpecElement>,
  onLoadActionIds: ReadonlySet<string>,
  actionApiKeys: Readonly<Record<string, string>>
): string[] {
  const ids: string[] = []
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Button') continue
    if (!REFRESH_LABEL.test(asString(element.props?.label))) continue
    const actionId = asString(element.props?.actionId)
    if (!actionId) {
      ids.push(id)
      continue
    }
    if (onLoadActionIds.has(actionId)) {
      ids.push(id)
      continue
    }
    if (!actionApiKeys[actionId]) {
      ids.push(id)
    }
  }
  return ids
}

function stripRepeatProse(spec: Spec): { spec: Spec; stripped: boolean } {
  const elements = { ...specElements(spec) }
  let stripped = false
  const remove = new Set<string>()
  for (const [repeatId, repeat] of Object.entries(elements)) {
    if (repeat.type !== 'Repeat') continue
    for (const id of descendantsOf(elements, repeatId)) {
      const element = elements[id]
      if (!element) continue
      const statePath = asString(element.props?.statePath)
      if (isProseItemPath(statePath)) {
        remove.add(id)
        stripped = true
        continue
      }
      const props = { ...element.props }
      let changed = false
      for (const [key, value] of Object.entries(props)) {
        if (typeof value !== 'string') continue
        ITEM_PROSE_TEMPLATE.lastIndex = 0
        if (!ITEM_PROSE_TEMPLATE.test(value)) continue
        ITEM_PROSE_TEMPLATE.lastIndex = 0
        const next = stripProseTemplates(value)
        if (next === value) continue
        if (next.length === 0) {
          props[key] = null
        } else {
          props[key] = next
        }
        changed = true
        stripped = true
      }
      if (changed) {
        elements[id] = { ...element, props }
      }
    }
    const columns = asString(repeat.props?.columns)
    if (columns) {
      const next = columns
        .split(',')
        .map((column) => column.trim())
        .filter((column) => {
          const key = column.split('|')[0]?.trim() ?? column
          return !PROSE_LEAVES.has(key)
        })
        .join(',')
      if (next !== columns) {
        elements[repeatId] = {
          ...repeat,
          props: { ...repeat.props, columns: next },
        }
        stripped = true
      }
    }
  }
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Table') continue
    const columns = asString(element.props?.columns)
    if (!columns) continue
    const next = columns
      .split(',')
      .map((column) => column.trim())
      .filter((column) => {
        const key = column.split('|')[0]?.trim() ?? column
        return !PROSE_LEAVES.has(key)
      })
      .join(',')
    if (next === columns) continue
    elements[id] = { ...element, props: { ...element.props, columns: next } }
    stripped = true
  }
  const withProps = { ...spec, elements }
  return { spec: stripElements(withProps, remove), stripped }
}

/**
 * Removes host-owned wait, notify, Refresh, and Repeat prose chrome from one page spec.
 */
export function stripHostOwnedChrome(
  spec: Spec,
  context: StripHostOwnedChromeContext
): { spec: Spec; changes: ArenaGenerativeAdoptedChange[] } {
  const cloned = structuredClone(spec)
  const changes: ArenaGenerativeAdoptedChange[] = []
  const pagePath = context.pagePath
  let elements = specElements(cloned)
  const hasForm = specHasForm(elements)
  const waitIds = collectFormWaitIds(elements, hasForm)
  let next = stripElements(cloned, new Set(waitIds))
  if (waitIds.length > 0) {
    changes.push({
      code: 'host-wait-chrome',
      asked: `Page "${pagePath}" emitted Spinner, ProgressBar, ProgressSteps, elapsed copy, or Cancel on the form.`,
      adopted: `Removed wait chrome on page "${pagePath}"; the host owns submit pending and WorkingCard.`,
    })
  }
  elements = specElements(next)
  const notifyIds = collectNotifyIds(elements)
  next = stripElements(next, new Set(notifyIds))
  if (notifyIds.length > 0) {
    changes.push({
      code: 'host-notify-chrome',
      asked: `Page "${pagePath}" emitted an error Alert, save Toast, or delete-confirm Modal.`,
      adopted: `Removed host-event Alert/Toast/Modal on page "${pagePath}"; the host owns banner, toast, and confirm.`,
    })
  }
  elements = specElements(next)
  const refreshIds = collectRefreshIds(
    elements,
    context.onLoadActionIds ?? new Set(),
    context.actionApiKeys ?? {}
  )
  next = stripElements(next, new Set(refreshIds))
  if (refreshIds.length > 0) {
    changes.push({
      code: 'host-refresh',
      asked: `Page "${pagePath}" emitted a Refresh Button.`,
      adopted: `Removed the Refresh Button on page "${pagePath}"; the host already offers Refresh after onLoad.`,
    })
  }
  const prose = stripRepeatProse(next)
  next = prose.spec
  if (prose.stripped) {
    changes.push({
      code: 'repeat-prose',
      asked: `Page "${pagePath}" bound item.output (or another prose field) on Repeat cards.`,
      adopted: `Removed prose item bindings on page "${pagePath}"; Open copies prose to content.`,
    })
  }
  return { spec: next, changes }
}

function rewriteNavItems(items: string, dropped: ReadonlySet<string>): string {
  const separator = items.includes('\n') ? '\n' : ','
  const next = items
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      const path = line.includes('|') ? line.split('|').at(-1)?.trim() ?? '' : ''
      if (!path) return true
      return !dropped.has(splitNavTarget(path).path)
    })
  return next.join(separator)
}

function rewriteDroppedNavigations(
  spec: Spec,
  dropped: ReadonlySet<string>,
  entryPath: string
): Spec {
  const elements = specElements(spec)
  let changed = false
  const next: Record<string, SpecElement> = { ...elements }
  for (const [id, element] of Object.entries(elements)) {
    const props = { ...element.props }
    let touched = false
    for (const key of ['to', 'navigateTo', 'cancelTo', 'activePath'] as const) {
      const target = asString(props[key])
      if (!target) continue
      if (!dropped.has(splitNavTarget(target).path)) continue
      props[key] = entryPath
      touched = true
    }
    const items = asString(props.items)
    if (items) {
      const rewritten = rewriteNavItems(items, dropped)
      if (rewritten !== items) {
        props.items = rewritten
        touched = true
      }
    }
    if (!touched) continue
    next[id] = { ...element, props }
    changed = true
  }
  return changed ? { ...spec, elements: next } : spec
}

function onLoadIdsFromManifest(manifest: ArenaGenerativeAppManifest): Set<string> {
  const ids = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    for (const actionId of page.onLoad ?? []) ids.add(actionId)
  }
  return ids
}

function actionApiKeysFromManifest(
  manifest: ArenaGenerativeAppManifest
): Record<string, string> {
  const keys: Record<string, string> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    if (action.apiKey) keys[actionId] = action.apiKey
  }
  return keys
}

function heuristicDropPath(
  path: string,
  keepHistory: boolean
): boolean {
  if (INVENTED_PAGE.test(path)) return true
  if (path === 'history' && !keepHistory) return true
  return false
}

function dropUnrequestedPages(
  manifest: ArenaGenerativeAppManifest,
  options: SanitizeHostOwnedManifestOptions
): { manifest: ArenaGenerativeAppManifest; changes: ArenaGenerativeAdoptedChange[] } {
  const entryPath = options.entryPath || manifest.entryPath
  const allowed = options.allowedPagePaths?.filter(Boolean) ?? []
  const keepHistory = requestSignalsHistory({
    userInput: options.userInput,
    apiBindings: options.apiBindings,
    pages: allowed.map((path) => ({ path, title: path })),
  })
  const dropped = new Set<string>()
  if (allowed.length > 0) {
    for (const path of Object.keys(manifest.pages)) {
      if (path === entryPath) continue
      if (!allowed.includes(path)) dropped.add(path)
    }
  } else if (!options.isPreserveEdit) {
    for (const path of Object.keys(manifest.pages)) {
      if (path === entryPath) continue
      if (heuristicDropPath(path, keepHistory)) dropped.add(path)
    }
  }
  if (dropped.size === 0) return { manifest, changes: [] }

  const pages = { ...manifest.pages }
  for (const path of dropped) {
    delete pages[path]
  }
  const actions: ArenaGenerativeAppManifest['actions'] = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const navigate = action.onSuccess?.navigate
    if (navigate && dropped.has(splitNavTarget(navigate).path)) {
      actions[actionId] = {
        ...action,
        onSuccess: {
          ...action.onSuccess,
          navigate: undefined,
        },
      }
      continue
    }
    actions[actionId] = action
  }
  for (const [path, page] of Object.entries(pages)) {
    pages[path] = {
      ...page,
      spec: rewriteDroppedNavigations(page.spec, dropped, entryPath),
      onLoad: page.onLoad?.filter((actionId) => actions[actionId] || !dropped.size),
    }
  }
  const nextEntry = pages[entryPath] ? entryPath : Object.keys(pages)[0]
  return {
    manifest: {
      ...manifest,
      entryPath: nextEntry,
      pages,
      actions,
    },
    changes: [
      {
        code: 'unrequested-pages',
        asked: `The draft added extra pages (${[...dropped].join(', ')}).`,
        adopted: `Dropped unrequested pages (${[...dropped].join(', ')}); kept ${nextEntry}.`,
      },
    ],
  }
}

/**
 * Persist-time sanitizer: strip host-owned chrome on authored pages and drop
 * extra dashboard/stats/history routes the brief did not list.
 */
export function sanitizeHostOwnedManifest(
  manifest: ArenaGenerativeAppManifest,
  options: SanitizeHostOwnedManifestOptions = {}
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  const onLoadActionIds = onLoadIdsFromManifest(manifest)
  const actionApiKeys = actionApiKeysFromManifest(manifest)
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  let next = manifest
  let pagesChanged = false
  const pages: ArenaGenerativeAppManifest['pages'] = { ...manifest.pages }
  for (const [path, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(path)) continue
    const stripped = stripHostOwnedChrome(page.spec, {
      pagePath: path,
      onLoadActionIds,
      actionApiKeys,
    })
    if (stripped.changes.length === 0) continue
    pagesChanged = true
    pages[path] = { ...page, spec: stripped.spec }
    adoptedChanges.push(...stripped.changes)
  }
  if (pagesChanged) {
    next = { ...manifest, pages }
  }
  const dropped = dropUnrequestedPages(next, options)
  return {
    manifest: dropped.manifest,
    adoptedChanges: [...adoptedChanges, ...dropped.changes],
  }
}

function asSpec(value: unknown): Spec | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const spec = value as Spec
  if (!spec.elements || typeof spec.elements !== 'object' || Array.isArray(spec.elements)) {
    return undefined
  }
  return spec
}

/**
 * Walks an unvalidated generate candidate so extra pages and Repeat prose are
 * gone before catalog / binding-layout validate.
 */
export function sanitizeHostOwnedCandidate(
  raw: Record<string, unknown>,
  options: SanitizeHostOwnedManifestOptions = {}
): { candidate: Record<string, unknown>; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const cloned = structuredClone(raw)
  const pagesRaw = cloned.pages
  if (!pagesRaw || typeof pagesRaw !== 'object' || Array.isArray(pagesRaw)) {
    return { candidate: cloned, adoptedChanges: [] }
  }
  const pages = pagesRaw as Record<string, unknown>
  const onLoadActionIds = new Set<string>()
  const actionApiKeys: Record<string, string> = {}
  const actionsRaw = cloned.actions
  if (actionsRaw && typeof actionsRaw === 'object' && !Array.isArray(actionsRaw)) {
    for (const [actionId, value] of Object.entries(actionsRaw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const apiKey = asString((value as Record<string, unknown>).apiKey)
      if (apiKey) actionApiKeys[actionId] = apiKey
    }
  }
  for (const page of Object.values(pages)) {
    if (!page || typeof page !== 'object') continue
    const onLoad = (page as Record<string, unknown>).onLoad
    if (!Array.isArray(onLoad)) continue
    for (const actionId of onLoad) {
      if (typeof actionId === 'string' && actionId.trim()) onLoadActionIds.add(actionId.trim())
    }
  }

  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  const authored = options.authoredPagePaths ? new Set(options.authoredPagePaths) : null
  for (const [path, page] of Object.entries(pages)) {
    if (authored && !authored.has(path)) continue
    if (!page || typeof page !== 'object') continue
    const record = page as Record<string, unknown>
    const spec = asSpec(record.spec)
    if (!spec) continue
    const stripped = stripHostOwnedChrome(spec, {
      pagePath: path,
      onLoadActionIds,
      actionApiKeys,
    })
    if (stripped.changes.length === 0) continue
    record.spec = stripped.spec
    adoptedChanges.push(...stripped.changes)
  }

  const fakeManifest: ArenaGenerativeAppManifest = {
    entryPath: asString(cloned.entryPath) || options.entryPath || Object.keys(pages)[0] || 'home',
    pages: Object.fromEntries(
      Object.entries(pages).flatMap(([path, page]) => {
        if (!page || typeof page !== 'object') return []
        const record = page as Record<string, unknown>
        const spec = asSpec(record.spec)
        if (!spec) return []
        const onLoad = Array.isArray(record.onLoad)
          ? record.onLoad.filter((id): id is string => typeof id === 'string')
          : undefined
        return [
          [
            path,
            {
              path,
              title: asString(record.title) || path,
              spec,
              ...(onLoad && onLoad.length > 0 ? { onLoad } : {}),
            },
          ],
        ]
      })
    ),
    actions: {},
  }
  if (actionsRaw && typeof actionsRaw === 'object' && !Array.isArray(actionsRaw)) {
    for (const [actionId, value] of Object.entries(actionsRaw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const action = value as Record<string, unknown>
      const onSuccess =
        action.onSuccess && typeof action.onSuccess === 'object'
          ? (action.onSuccess as Record<string, unknown>)
          : undefined
      fakeManifest.actions[actionId] = {
        apiKey: asString(action.apiKey) || undefined,
        onSuccess: onSuccess
          ? { navigate: asString(onSuccess.navigate) || undefined }
          : undefined,
      }
    }
  }

  const dropped = dropUnrequestedPages(fakeManifest, {
    ...options,
    entryPath: fakeManifest.entryPath,
  })
  if (dropped.changes.length > 0) {
    cloned.entryPath = dropped.manifest.entryPath
    cloned.pages = Object.fromEntries(
      Object.entries(dropped.manifest.pages).map(([path, page]) => {
        const previous = pages[path]
        const record =
          previous && typeof previous === 'object'
            ? { ...(previous as Record<string, unknown>) }
            : {}
        record.path = page.path
        record.title = page.title
        record.spec = page.spec
        if (page.onLoad) record.onLoad = page.onLoad
        return [path, record]
      })
    )
    if (actionsRaw && typeof actionsRaw === 'object' && !Array.isArray(actionsRaw)) {
      const nextActions = { ...(actionsRaw as Record<string, unknown>) }
      for (const [actionId, action] of Object.entries(dropped.manifest.actions)) {
        const previous = nextActions[actionId]
        if (!previous || typeof previous !== 'object') continue
        const record = previous as Record<string, unknown>
        if (action.onSuccess && 'navigate' in action.onSuccess && !action.onSuccess.navigate) {
          const onSuccess =
            record.onSuccess && typeof record.onSuccess === 'object'
              ? { ...(record.onSuccess as Record<string, unknown>) }
              : {}
          delete onSuccess.navigate
          record.onSuccess = onSuccess
        }
      }
      cloned.actions = nextActions
    }
    adoptedChanges.push(...dropped.changes)
  }

  return { candidate: cloned, adoptedChanges }
}
