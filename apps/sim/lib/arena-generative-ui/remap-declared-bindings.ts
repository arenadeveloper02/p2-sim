import type { Spec } from '@json-render/core'
import { truncate } from '@sim/utils/string'
import {
  type BindingLayoutCollection,
  type BindingLayoutPlan,
  HOST_RESERVED_STATE_ROOTS,
  SCHEMA_ENVELOPE_SEGMENTS,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import { closestDeclaredName } from '@/lib/arena-generative-ui/closest-declared'
import { isFormFieldType } from '@/lib/arena-generative-ui/form-fields'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import type {
  ArenaGenerativeActionManifest,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'

const ASKED_ADOPTED_MAX = 500
const HOST_RESERVED_ROOTS = new Set<string>(HOST_RESERVED_STATE_ROOTS)

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pushRemap(
  changes: ArenaGenerativeAdoptedChange[],
  asked: string,
  adopted: string
): void {
  if (asked === adopted) return
  changes.push({
    code: 'product-map',
    asked: truncate(asked, ASKED_ADOPTED_MAX),
    adopted: truncate(adopted, ASKED_ADOPTED_MAX),
  })
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

/**
 * Remap an invented CTA apiKey onto a unique declared binding key. Single
 * declared binding always wins. Returns undefined when no unique match exists.
 */
export function remapDeclaredApiKey(
  apiKey: string,
  declaredKeys: readonly string[]
): string | undefined {
  const trimmed = apiKey.trim()
  if (!trimmed) return undefined
  if (declaredKeys.includes(trimmed)) return trimmed
  return closestDeclaredName(trimmed, declaredKeys, { singleNameFallback: true })
}

export function remapManifestApiKeys(
  actions: Record<string, ArenaGenerativeActionManifest>,
  declaredKeys: readonly string[]
): ArenaGenerativeAdoptedChange[] {
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  if (declaredKeys.length === 0) return adoptedChanges

  for (const [actionId, action] of Object.entries(actions)) {
    const apiKey = action.apiKey?.trim()
    if (!apiKey || declaredKeys.includes(apiKey)) continue
    const remapped = remapDeclaredApiKey(apiKey, declaredKeys)
    if (!remapped) continue
    action.apiKey = remapped
    pushRemap(
      adoptedChanges,
      `Action "${actionId}" called API key "${apiKey}".`,
      `Rewired it to declared key "${remapped}".`
    )
  }
  return adoptedChanges
}

function knownBindingPaths(plans: readonly BindingLayoutPlan[]): {
  hostKeys: string[]
  collections: BindingLayoutCollection[]
} {
  const hostKeys: string[] = []
  const collections: BindingLayoutCollection[] = []
  const seen = new Set<string>()
  for (const plan of plans) {
    for (const key of [...plan.hostKeys, ...plan.aliasKeys]) {
      if (seen.has(key)) continue
      seen.add(key)
      hostKeys.push(key)
    }
    collections.push(...plan.collections)
  }
  return { hostKeys, collections }
}

function isKnownBindingPath(
  path: string,
  hostKeys: readonly string[],
  collections: readonly BindingLayoutCollection[]
): boolean {
  if (hostKeys.includes(path)) return true
  return collections.some(
    (collection) =>
      collection.hostKey === path ||
      collection.schemaPaths.includes(path) ||
      collection.wrapperKeys.includes(path)
  )
}

function liftCollectionPath(
  path: string,
  collections: readonly BindingLayoutCollection[]
): string | undefined {
  for (const collection of collections) {
    if (path === collection.hostKey) return path
    if (collection.schemaPaths.includes(path) || collection.wrapperKeys.includes(path)) {
      return collection.hostKey
    }
  }
  return undefined
}

function remapStatePath(
  statePath: string,
  hostKeys: readonly string[],
  collections: readonly BindingLayoutCollection[]
): string {
  if (statePath === 'item' || statePath.startsWith('item.')) return statePath

  let path = statePath
  const parts = path.split('.')
  if (parts.length > 1 && SCHEMA_ENVELOPE_SEGMENTS.has(parts[0] ?? '')) {
    const rest = parts.slice(1).join('.')
    if (isKnownBindingPath(rest, hostKeys, collections)) {
      path = rest
    }
  }

  const lifted = liftCollectionPath(path, collections)
  if (lifted) return lifted

  if (hostKeys.includes(path)) return path

  const root = path.split('.')[0] ?? ''
  if (HOST_RESERVED_ROOTS.has(root)) return path

  const closestPath = closestDeclaredName(path, hostKeys)
  if (closestPath) return closestPath

  const closestRoot = closestDeclaredName(root, hostKeys)
  if (closestRoot) {
    return `${closestRoot}${path.slice(root.length)}`
  }

  return path
}

function remapFormFieldNames(
  elements: Record<string, SpecElement>,
  fieldIds: readonly string[],
  formFields: readonly string[],
  adoptedChanges: ArenaGenerativeAdoptedChange[],
  pagePath: string
): void {
  if (formFields.length === 0) return
  const used = new Set<string>()
  for (const id of fieldIds) {
    const element = elements[id]
    if (!element || !isFormFieldType(element.type)) continue
    const name = asString(element.props?.name)
    if (name && formFields.includes(name)) used.add(name)
  }

  for (const id of fieldIds) {
    const element = elements[id]
    if (!element?.props || !isFormFieldType(element.type)) continue
    const name = asString(element.props.name)
    if (!name || formFields.includes(name)) continue
    const remapped = closestDeclaredName(name, formFields)
    if (!remapped || used.has(remapped)) continue
    element.props.name = remapped
    used.add(remapped)
    pushRemap(
      adoptedChanges,
      `Page "${pagePath}" field "${id}" used name "${name}".`,
      `Renamed it to declared input "${remapped}".`
    )
  }
}

/**
 * Strip envelope statePaths, lift collection wrappers onto hostKeys, and
 * rename form fields onto unique declared inputSchema names. Mutates `manifest`.
 */
export function remapBindingLayout(
  manifest: ArenaGenerativeAppManifest,
  plans: readonly BindingLayoutPlan[]
): ArenaGenerativeAdoptedChange[] {
  const adoptedChanges: ArenaGenerativeAdoptedChange[] = []
  const { hostKeys, collections } = knownBindingPaths(plans)
  const planByKey = new Map(plans.map((plan) => [plan.key, plan]))

  for (const [pagePath, page] of Object.entries(manifest.pages)) {
    const elements = specElements(page.spec)
    for (const [id, element] of Object.entries(elements)) {
      const statePath = asString(element.props?.statePath)
      if (!statePath || !element.props) continue
      const remapped = remapStatePath(statePath, hostKeys, collections)
      if (remapped === statePath) continue
      element.props.statePath = remapped
      pushRemap(
        adoptedChanges,
        `Page "${pagePath}" ${element.type ?? 'element'} "${id}" bound "${statePath}".`,
        `Rebound it to "${remapped}".`
      )
    }

    for (const [actionId, action] of Object.entries(manifest.actions)) {
      const plan = action.apiKey ? planByKey.get(action.apiKey) : undefined
      if (!plan || plan.formFields.length === 0) continue
      const fieldIds: string[] = []
      for (const [id, element] of Object.entries(elements)) {
        const type = element.type ?? ''
        if (asString(element.props?.actionId) !== actionId) continue
        if (type === 'SearchField') {
          fieldIds.push(id)
        }
        if (type === 'Form') {
          fieldIds.push(...descendantsOf(elements, id))
        }
      }
      if (fieldIds.length === 0) continue
      remapFormFieldNames(elements, fieldIds, plan.formFields, adoptedChanges, pagePath)
    }
  }

  return adoptedChanges
}
