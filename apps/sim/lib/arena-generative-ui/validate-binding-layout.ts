import type { Spec } from '@json-render/core'
import {
  type BindingLayoutCollection,
  type BindingLayoutPlan,
  HOST_RESERVED_STATE_ROOTS,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import { isFormFieldType } from '@/lib/arena-generative-ui/form-fields'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { splitNavTarget } from '@/lib/arena-generative-ui/types'

const BOUND_RESULT_TYPES = new Set([
  'Table',
  'Repeat',
  'Stat',
  'KeyValue',
  'DataText',
  'Sparkline',
  'ProgressBar',
])

const COLLECTION_TYPES = new Set(['Table', 'Repeat'])

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
 * allowed when no schema named them — that is still prompt-only.
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

  for (const [path, page] of Object.entries(manifest.pages)) {
    if (authored && !authored.has(path)) continue
    const elements = specElements(page.spec)
    const navigateError = navigateFirstOnLoadError(path, page.onLoad, manifest.actions)
    if (navigateError) return navigateError

    for (const [actionId, action] of Object.entries(manifest.actions)) {
      if (!pageSubmitsAction(elements, actionId)) continue
      const plan = planByKey.get(action.apiKey)
      if (!plan) continue
      const formError = formFieldsError(path, actionId, elements, plan)
      if (formError) return formError
    }

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
  if (plan.formFields.length === 0 && plan.hiddenInputFields.length === 0) return undefined
  const names = formFieldNamesForAction(elements, actionId)
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

function planHasStructuredSchema(plan: BindingLayoutPlan): boolean {
  return (
    plan.collections.length > 0 ||
    plan.metricPaths.length > 0 ||
    plan.recordKeys.length > 0 ||
    plan.stringFieldNames.length > 0
  )
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
