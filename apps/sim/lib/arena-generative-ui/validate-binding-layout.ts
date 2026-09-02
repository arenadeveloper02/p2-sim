import type { Spec } from '@json-render/core'
import {
  type BindingLayoutCollection,
  type BindingLayoutPlan,
  HOST_RESERVED_STATE_ROOTS,
  planHasStructuredSchema,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import { hasChatProtocolInput } from '@/lib/arena-generative-ui/chat-protocol'
import { isFormFieldType, parseShowWhen } from '@/lib/arena-generative-ui/form-fields'
import { isReservedStartInputName } from '@/lib/arena-generative-ui/input-schema'
import {
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  type ArenaGenerativeAppManifest,
  parseTabItems,
  specHasSamePageSelectItem,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'

const BOUND_RESULT_TYPES = new Set([
  'Table',
  'Repeat',
  'Stat',
  'KeyValue',
  'DataText',
  'Sparkline',
  'Chart',
  'ProgressBar',
])

const ACTION_WIRE_TYPES = new Set(['Form', 'SubmitButton', 'Button', 'SearchField', 'Chip', 'Chat'])

const COLLECTION_TYPES = new Set(['Table', 'Repeat', 'Chart'])

const ENVELOPE_ROOTS = new Set(['data', 'response'])

const HOST_RESERVED_ROOTS = new Set<string>(HOST_RESERVED_STATE_ROOTS)

const ITEM_PROSE_TEMPLATE = /\{item\.(output|content|body|text|message|assistantContent)\}/i

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

interface LayoutCheckOptions {
  authoredPagePaths?: string[]
}

/**
 * Generate-time checks against BindingLayoutPlan. Unknown statePaths stay
 * allowed when no schema named them. Structured plans must bind their
 * required host keys; live response drift stays warn-only at runtime.
 */
export function validateManifestBindingLayout(
  manifest: ArenaGenerativeAppManifest,
  plans: BindingLayoutPlan[],
  options: LayoutCheckOptions = {}
): string | undefined {
  const authored =
    options.authoredPagePaths && options.authoredPagePaths.length > 0
      ? new Set(options.authoredPagePaths)
      : null
  const planByKey = new Map(plans.map((plan) => [plan.key, plan]))
  const generateKeys = generateBindingKeys(manifest)

  for (const [path, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(path)) continue
    const elements = specElements(page.spec)
    const navigateError = navigateFirstOnLoadError(path, page.onLoad, manifest.actions)
    if (navigateError) return navigateError

    const tabError = duplicateTabPathError(path, specElements(page.spec))
    if (tabError) return tabError

    const listHiddenError = listHiddenWithoutSamePageSelectError(path, page.spec)
    if (listHiddenError) return listHiddenError

    for (const [actionId, action] of Object.entries(manifest.actions)) {
      if (!pageSubmitsAction(elements, actionId)) continue
      const plan = action.apiKey ? planByKey.get(action.apiKey) : undefined
      if (!plan) continue
      const formError = formFieldsError(path, actionId, elements, plan)
      if (formError) return formError
    }

    const chatError = chatElementsError(path, elements, manifest, planByKey)
    if (chatError) return chatError

    const copyError = copyDownloadReboundError(path, elements, manifest, generateKeys)
    if (copyError) return copyError

    const showWhenError = showWhenDataTextMismatchError(path, elements, plans)
    if (showWhenError) return showWhenError

    for (const [id, element] of Object.entries(elements)) {
      const type = element.type ?? ''
      const statePath = asString(element.props?.statePath)
      if (BOUND_RESULT_TYPES.has(type) && statePath) {
        const bindError = boundPathError(path, type, id, statePath, plans)
        if (bindError) return bindError
      }
      if (type === 'Table' && statePath) {
        const columnError = tableColumnError(path, id, element.props?.columns, plans, statePath)
        if (columnError) return columnError
      }
      if (type === 'Repeat') {
        const itemError = repeatItemError(path, id, page.spec, id, plans, statePath)
        if (itemError) return itemError
      }
    }
  }

  const chatOnlyError = chatOnlyBindingError(manifest, plans)
  if (chatOnlyError) return chatOnlyError

  const streamChatError = streamChatSurfaceError(manifest, plans)
  if (streamChatError) return streamChatError

  return unboundHostKeysError(manifest, plans)
}

function generateBindingKeys(manifest: ArenaGenerativeAppManifest): Set<string> {
  const keys = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    const elements = specElements(page.spec)
    for (const [actionId, action] of Object.entries(manifest.actions)) {
      if (!action.apiKey) continue
      if (pageSubmitsAction(elements, actionId)) keys.add(action.apiKey)
    }
  }
  return keys
}

function duplicateTabPathError(
  pagePath: string,
  elements: Record<string, SpecElement>
): string | undefined {
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Tabs') continue
    const seen = new Set<string>()
    for (const item of parseTabItems(element.props?.items)) {
      const tabPath = splitNavTarget(item.path).path
      if (!tabPath) continue
      if (seen.has(tabPath)) {
        return `Page "${pagePath}" Tabs "${id}" repeats path "${tabPath}". Each tab must be a distinct page path.`
      }
      seen.add(tabPath)
    }
  }
  return undefined
}

function listHiddenWithoutSamePageSelectError(pagePath: string, spec: Spec): string | undefined {
  if (specHasSamePageSelectItem(spec, pagePath)) return undefined
  const elements = specElements(spec)
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Repeat' && element.type !== 'Table') continue
    if (showWhenHidesOnSelectedId(element.props?.showWhen)) {
      return `Page "${pagePath}" ${element.type} "${id}" uses showWhen "!selectedId" but Open is not same-page. Keep a dedicated History list visible.`
    }
    for (const ancestorId of collectionAncestors(elements, id)) {
      if (!showWhenHidesOnSelectedId(elements[ancestorId]?.props?.showWhen)) continue
      return `Page "${pagePath}" ${element.type} "${id}" is hidden by showWhen "!selectedId" but Open is not same-page. Keep a dedicated History list visible.`
    }
  }
  return undefined
}

function showWhenHidesOnSelectedId(showWhen: unknown): boolean {
  return parseShowWhen(showWhen).some(
    (clause) => clause.op === 'falsy' && clause.name === ARENA_GENERATIVE_SELECTED_ID_KEY
  )
}

function collectionAncestors(elements: Record<string, SpecElement>, childId: string): string[] {
  const parents = new Map<string, string>()
  for (const [id, element] of Object.entries(elements)) {
    for (const child of element.children ?? []) {
      parents.set(child, id)
    }
  }
  const ids: string[] = []
  let current = parents.get(childId)
  while (current) {
    ids.push(current)
    current = parents.get(current)
  }
  return ids
}

const COPY_DOWNLOAD_LABEL =
  /^(copy|download)(\s+(markdown|pdf))?$|copy markdown|download pdf|^pdf$/i

function isCopyOrDownloadLabel(label: string): boolean {
  const trimmed = label.trim()
  if (!trimmed) return false
  return COPY_DOWNLOAD_LABEL.test(trimmed)
}

function chromeLabel(element: SpecElement): string {
  return asString(element.props?.label) || asString(element.props?.text)
}

function copyDownloadReboundError(
  pagePath: string,
  elements: Record<string, SpecElement>,
  manifest: ArenaGenerativeAppManifest,
  generateKeys: Set<string>
): string | undefined {
  if (generateKeys.size === 0) return undefined
  for (const [id, element] of Object.entries(elements)) {
    const type = element.type ?? ''
    if (type !== 'Button' && type !== 'Chip') continue
    const label = chromeLabel(element)
    if (!isCopyOrDownloadLabel(label)) continue
    const actionId = asString(element.props?.actionId)
    if (!actionId) continue
    const apiKey = manifest.actions[actionId]?.apiKey
    if (!apiKey || !generateKeys.has(apiKey)) continue
    return `Page "${pagePath}" ${type} "${id}" labeled "${label}" rebinds generate API "${apiKey}". Copy Markdown and Download PDF must not call the generate workflow.`
  }
  return undefined
}

function proseHostKeys(plans: BindingLayoutPlan[]): Set<string> {
  const keys = new Set<string>([ARENA_GENERATIVE_STREAM_CONTENT_KEY])
  for (const plan of plans) {
    for (const name of plan.stringFieldNames) keys.add(name)
    for (const path of plan.prosePaths) keys.add(path)
  }
  return keys
}

function showWhenDataTextMismatchError(
  pagePath: string,
  elements: Record<string, SpecElement>,
  plans: BindingLayoutPlan[]
): string | undefined {
  const proseKeys = proseHostKeys(plans)
  for (const [id, element] of Object.entries(elements)) {
    const showWhen = asString(element.props?.showWhen)
    const showKeys = parseShowWhen(showWhen)
      .filter((clause) => clause.op === 'truthy')
      .map((clause) => clause.name)
      .filter((name) => proseKeys.has(name))
    if (showKeys.length === 0) continue
    const ids =
      element.type === 'DataText' ? [id, ...descendantsOf(elements, id)] : descendantsOf(elements, id)
    for (const childId of ids) {
      const child = elements[childId]
      if (child?.type !== 'DataText') continue
      const statePath = asString(child.props?.statePath)
      if (!statePath) continue
      const root = statePath.split('.')[0] ?? ''
      if (!proseKeys.has(root)) continue
      if (showKeys.includes(root)) continue
      return `Page "${pagePath}" DataText "${childId}" binds statePath "${statePath}" inside showWhen "${showWhen}". showWhen and DataText must share the same host key.`
    }
  }
  return undefined
}

function navigateFirstOnLoadError(
  pagePath: string,
  onLoad: string[] | undefined,
  actions: ArenaGenerativeAppManifest['actions']
): string | undefined {
  if (!onLoad || onLoad.length === 0) return undefined
  for (const actionId of onLoad) {
    const target = actions[actionId]?.onSuccess?.navigate
    if (!target) continue
    if (splitNavTarget(target).path !== pagePath) continue
    return `Page "${pagePath}" onLoad runs "${actionId}" which already navigates here on success. Remove that onLoad so the CTA body is not refetched.`
  }
  return undefined
}

function formFieldsError(
  pagePath: string,
  actionId: string,
  elements: Record<string, SpecElement>,
  plan: BindingLayoutPlan
): string | undefined {
  const names = formFieldNamesForAction(elements, actionId)
  const reserved = names.find((name) => isReservedStartInputName(name))
  if (reserved) {
    return `Page "${pagePath}" form for action "${actionId}" includes reserved start field "${reserved}". Use Chat for input, files, and conversationId.`
  }
  if (plan.formFields.length === 0 && plan.hiddenInputFields.length === 0) return undefined
  const hidden = names.find((name) => plan.hiddenInputFields.includes(name))
  if (hidden) {
    return `Page "${pagePath}" form for action "${actionId}" renders "${hidden}", which the host sends itself. Do not add a field for visitorEmail or constant inputs.`
  }
  const missing = plan.formFields.find((name) => !names.includes(name))
  if (missing) {
    return `Page "${pagePath}" form for action "${actionId}" is missing inputSchema field "${missing}".`
  }
  const extra = names.find(
    (name) => !plan.formFields.includes(name) && !plan.hiddenInputFields.includes(name)
  )
  if (extra) {
    return `Page "${pagePath}" form for action "${actionId}" includes field "${extra}", which is not in inputSchema.`
  }
  return undefined
}

function chatElementsError(
  pagePath: string,
  elements: Record<string, SpecElement>,
  manifest: ArenaGenerativeAppManifest,
  planByKey: Map<string, BindingLayoutPlan>
): string | undefined {
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Chat') continue
    const actionId = asString(element.props?.actionId)
    if (!actionId) {
      return `Page "${pagePath}" Chat "${id}" is missing actionId.`
    }
    const action = manifest.actions[actionId]
    if (!action) {
      return `Page "${pagePath}" Chat "${id}" action "${actionId}" is not in manifest.actions.`
    }
    const plan = action.apiKey ? planByKey.get(action.apiKey) : undefined
    if (!hasChatProtocolInput(plan?.chatProtocol)) {
      return `Page "${pagePath}" Chat "${id}" action "${actionId}" has no chat protocol. Bind a workflow Start that includes input.`
    }
  }
  return undefined
}

function chatOnlyBindingError(
  manifest: ArenaGenerativeAppManifest,
  plans: BindingLayoutPlan[]
): string | undefined {
  const chatActionIds = chatActionIdsFrom(manifest)
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const plan = action.apiKey ? plans.find((item) => item.key === action.apiKey) : undefined
    if (!plan || !hasChatProtocolInput(plan.chatProtocol)) continue
    if (plan.formFields.length > 0) continue
    if (chatActionIds.has(actionId)) continue
    return `Binding "${plan.key}" has chat protocol input and no form fields. Add a Chat with an action that uses that binding.`
  }
  return undefined
}

function chatActionIdsFrom(manifest: ArenaGenerativeAppManifest): Set<string> {
  const ids = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    for (const element of Object.values(specElements(page.spec))) {
      if (element.type !== 'Chat') continue
      const actionId = asString(element.props?.actionId)
      if (actionId) ids.add(actionId)
    }
  }
  return ids
}

/**
 * Stream + chat protocol needs a live content surface on the destination:
 * DataText statePath "content", or Chat (the host paints streamed content above it).
 */
function streamChatSurfaceError(
  manifest: ArenaGenerativeAppManifest,
  plans: BindingLayoutPlan[]
): string | undefined {
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const plan = action.apiKey ? plans.find((item) => item.key === action.apiKey) : undefined
    if (!plan?.stream || !hasChatProtocolInput(plan.chatProtocol)) continue
    const destPath = splitNavTarget(action.onSuccess?.navigate).path
    const destPages = destPath ? [destPath] : pagesThatWireAction(manifest, actionId)
    for (const pagePath of destPages) {
      const page = manifest.pages[pagePath]
      if (!page) continue
      if (pageHasStreamChatSurface(specElements(page.spec), actionId)) continue
      return `Binding "${plan.key}" streams with chat protocol. Put Chat or DataText statePath "content" on page "${pagePath}".`
    }
  }
  return undefined
}

function pageHasStreamChatSurface(
  elements: Record<string, SpecElement>,
  actionId: string
): boolean {
  for (const element of Object.values(elements)) {
    if (element.type === 'Chat' && asString(element.props?.actionId) === actionId) {
      return true
    }
    if (
      element.type === 'DataText' &&
      asString(element.props?.statePath) === ARENA_GENERATIVE_STREAM_CONTENT_KEY
    ) {
      return true
    }
  }
  return false
}

function pagesThatWireAction(manifest: ArenaGenerativeAppManifest, actionId: string): string[] {
  const paths: string[] = []
  for (const [path, page] of Object.entries(manifest.pages)) {
    for (const element of Object.values(specElements(page.spec))) {
      if (!ACTION_WIRE_TYPES.has(element.type ?? '')) continue
      if (asString(element.props?.actionId) !== actionId) continue
      paths.push(path)
      break
    }
  }
  return paths
}

function boundPathError(
  pagePath: string,
  type: string,
  elementId: string,
  statePath: string,
  plans: BindingLayoutPlan[]
): string | undefined {
  if (statePath === 'item' || statePath.startsWith('item.')) return undefined
  const root = statePath.split('.')[0] ?? ''
  if (HOST_RESERVED_ROOTS.has(root)) return undefined
  if (ENVELOPE_ROOTS.has(root)) {
    return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}". Use the response field itself, never a data. or response. prefix.`
  }
  if (root === 'output' && statePath.includes('.')) {
    return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}". Use the response field itself, never output.articles.`
  }

  const structured = plans.filter((plan) => planHasStructuredSchema(plan))
  if (structured.length === 0) return undefined

  for (const plan of structured) {
    for (const collection of plan.collections) {
      if (statePath === collection.hostKey || collection.schemaPaths.includes(statePath)) {
        if (COLLECTION_TYPES.has(type)) {
          if (statePath !== collection.hostKey && !plan.aliasKeys.includes(statePath)) {
            return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}"; the host lifts that collection to "${collection.hostKey}". Bind statePath "${collection.hostKey}".`
          }
          return undefined
        }
        if (type === 'DataText') {
          return `Page "${pagePath}" DataText "${elementId}" binds statePath "${statePath}"; that field is a collection. Use Repeat or Table.`
        }
      }
      if (collection.wrapperKeys.includes(statePath) && COLLECTION_TYPES.has(type)) {
        return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}"; the host lifts that collection to "${collection.hostKey}". Bind statePath "${collection.hostKey}".`
      }
    }
    if (plan.stringFieldNames.includes(root) && statePath === `${root}.content`) {
      return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}"; ${root} is a string. Bind "${root}" or "content".`
    }
    if (COLLECTION_TYPES.has(type) && plan.stringFieldNames.includes(statePath)) {
      return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}"; that field is a string. Use DataText on "${statePath}" or "content".`
    }
    if (COLLECTION_TYPES.has(type) && plan.metricPaths.includes(statePath)) {
      return `Page "${pagePath}" ${type} "${elementId}" binds statePath "${statePath}"; that field is a number. Use Stat.`
    }
  }

  return undefined
}

function tableColumnError(
  pagePath: string,
  elementId: string,
  columns: unknown,
  plans: BindingLayoutPlan[],
  statePath: string
): string | undefined {
  const collection = collectionForStatePath(plans, statePath)
  if (!collection || collection.proseFields.length === 0) return undefined
  const headers = asString(columns)
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean)
  const prose = headers.find((header) => collection.proseFields.includes(header))
  if (!prose) return undefined
  return `Page "${pagePath}" Table "${elementId}" includes column "${prose}"; that field is prose. Bind short scalars only and use selectItem to copy prose to content.`
}

function repeatItemError(
  pagePath: string,
  repeatId: string,
  spec: Spec,
  repeatElementId: string,
  plans: BindingLayoutPlan[],
  statePath: string
): string | undefined {
  const collection = collectionForStatePath(plans, statePath)
  const elements = specElements(spec)
  const descendantIds = descendantsOf(elements, repeatElementId)
  for (const id of descendantIds) {
    const element = elements[id]
    if (!element) continue
    const itemPath = asString(element.props?.statePath)
    if (itemPath.startsWith('item.')) {
      const field = itemPath.slice('item.'.length)
      const leaf = field.split('.').pop() ?? field
      if (collection?.proseFields.includes(leaf) || isProseLeaf(leaf)) {
        return `Page "${pagePath}" Repeat "${repeatId}" binds ${itemPath}; that field is prose. Bind short scalars (${formatItemFields(collection)}) and use selectItem to copy prose to content.`
      }
    }
    for (const value of Object.values(element.props ?? {})) {
      if (typeof value !== 'string' || !ITEM_PROSE_TEMPLATE.test(value)) continue
      return `Page "${pagePath}" Repeat "${repeatId}" interpolates a prose item field in "${id}". Bind short scalars only; Open uses selectItem to copy prose to content.`
    }
  }
  return undefined
}

function collectionForStatePath(
  plans: BindingLayoutPlan[],
  statePath: string
): BindingLayoutCollection | undefined {
  for (const plan of plans) {
    for (const collection of plan.collections) {
      if (
        collection.hostKey === statePath ||
        collection.schemaPaths.includes(statePath) ||
        plan.aliasKeys.includes(statePath)
      ) {
        return collection
      }
    }
  }
  return undefined
}

/**
 * Generate/edit fail when a structured plan is in use but a required host key
 * never appears as statePath. Runtime outputSchema drift stays warn-only.
 */
function unboundHostKeysError(
  manifest: ArenaGenerativeAppManifest,
  plans: BindingLayoutPlan[]
): string | undefined {
  const bound = collectBoundDisplayKeys(manifest)
  const usedKeys = usedApiKeys(manifest)
  for (const plan of plans) {
    if (!planHasStructuredSchema(plan)) continue
    if (!usedKeys.has(plan.key) && !planIdentityKeys(plan).some((key) => bound.has(key))) {
      continue
    }
    const missing = missingRequiredHostKeys(plan, bound)
    if (missing.length === 0) continue
    const noun = missing.length === 1 ? 'host key' : 'host keys'
    return `Binding "${plan.key}" never binds required ${noun}: ${missing.join(', ')}.`
  }
  return undefined
}

function collectBoundDisplayKeys(manifest: ArenaGenerativeAppManifest): Set<string> {
  const bound = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    for (const element of Object.values(specElements(page.spec))) {
      if (element.type === 'Chat') {
        bound.add(ARENA_GENERATIVE_STREAM_CONTENT_KEY)
      }
      if (!BOUND_RESULT_TYPES.has(element.type ?? '')) continue
      const statePath = asString(element.props?.statePath)
      if (!statePath || statePath === 'item' || statePath.startsWith('item.')) continue
      const root = statePath.split('.')[0] ?? ''
      if (root === 'selected' || root === 'selectedId') {
        bound.add(ARENA_GENERATIVE_STREAM_CONTENT_KEY)
        continue
      }
      bound.add(statePath)
      if (root) bound.add(root)
    }
  }
  return bound
}

function usedApiKeys(manifest: ArenaGenerativeAppManifest): Set<string> {
  const actionIds = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    for (const actionId of page.onLoad ?? []) {
      if (actionId) actionIds.add(actionId)
    }
    for (const element of Object.values(specElements(page.spec))) {
      if (!ACTION_WIRE_TYPES.has(element.type ?? '')) continue
      const actionId = asString(element.props?.actionId)
      if (actionId) actionIds.add(actionId)
    }
  }
  const keys = new Set<string>()
  for (const actionId of actionIds) {
    const apiKey = manifest.actions[actionId]?.apiKey
    if (apiKey) keys.add(apiKey)
  }
  return keys
}

function planIdentityKeys(plan: BindingLayoutPlan): string[] {
  const keys = [
    ...plan.collections.map((collection) => collection.hostKey),
    ...plan.metricPaths,
    ...plan.recordKeys,
    ...plan.stringFieldNames,
  ]
  if (plan.aliasKeys.includes('items')) keys.push('items')
  for (const path of plan.metricPaths) {
    const root = path.split('.')[0]
    if (root) keys.push(root)
  }
  return keys
}

function missingRequiredHostKeys(plan: BindingLayoutPlan, bound: Set<string>): string[] {
  const missing: string[] = []
  for (const collection of plan.collections) {
    if (bound.has(collection.hostKey)) continue
    if (plan.aliasKeys.includes('items') && bound.has('items')) continue
    missing.push(collection.hostKey)
  }
  for (const path of plan.metricPaths) {
    const root = path.split('.')[0] ?? path
    if (bound.has(path) || bound.has(root)) continue
    missing.push(path)
  }
  for (const key of plan.recordKeys) {
    if (!bound.has(key)) missing.push(key)
  }
  if (plan.stringFieldNames.length > 0) {
    const hasString = plan.stringFieldNames.some((name) => bound.has(name))
    if (!hasString && !bound.has('content')) {
      missing.push(plan.stringFieldNames[0] ?? 'content')
    }
  } else if (plan.hostKeys.includes('content') && !bound.has('content')) {
    missing.push('content')
  }
  return missing
}

function pageSubmitsAction(elements: Record<string, SpecElement>, actionId: string): boolean {
  for (const element of Object.values(elements)) {
    const type = element.type ?? ''
    if (type !== 'Form' && type !== 'SearchField') continue
    if (asString(element.props?.actionId) === actionId) return true
  }
  return false
}

function formFieldNamesForAction(
  elements: Record<string, SpecElement>,
  actionId: string
): string[] {
  const names: string[] = []
  for (const [id, element] of Object.entries(elements)) {
    if (element.type === 'SearchField' && asString(element.props?.actionId) === actionId) {
      const name = asString(element.props?.name)
      if (name) names.push(name)
    }
    if (element.type !== 'Form' || asString(element.props?.actionId) !== actionId) continue
    collectFormFieldNames(elements, id, names)
  }
  return names
}

function collectFormFieldNames(
  elements: Record<string, SpecElement>,
  parentId: string,
  names: string[]
): void {
  const parent = elements[parentId]
  for (const childId of parent?.children ?? []) {
    const child = elements[childId]
    if (!child) continue
    if (isFormFieldType(child.type) && asString(child.props?.name)) {
      names.push(asString(child.props?.name))
    }
    collectFormFieldNames(elements, childId, names)
  }
}

function specElements(spec: Spec): Record<string, SpecElement> {
  const elements = spec.elements
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) {
    return {}
  }
  return elements as Record<string, SpecElement>
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

function formatItemFields(collection: BindingLayoutCollection | undefined): string {
  const sample = collection?.itemFields.filter((field) => !field.includes('.'))[0]
  return sample ? `item.${sample}` : 'item.keyword'
}

function isProseLeaf(leaf: string): boolean {
  return (
    leaf === 'output' ||
    leaf === 'content' ||
    leaf === 'body' ||
    leaf === 'text' ||
    leaf === 'message' ||
    leaf === 'assistantContent'
  )
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
