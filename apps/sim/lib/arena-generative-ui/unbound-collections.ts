const HOST_STATE_KEYS = new Set([
  'inputs',
  'selected',
  'selectedId',
  'content',
  'error',
  'toast',
])

interface SpecLike {
  elements?: Record<string, { props?: Record<string, unknown> }>
}

/**
 * Object arrays in host state that no spec `statePath` binds.
 * Shown after a response lands. Two unbound prose strings are left for the brief.
 */
export function unboundCollections(
  spec: SpecLike,
  state: Record<string, unknown>
): Array<{ key: string; items: unknown[] }> {
  const bound = new Set<string>()
  for (const element of Object.values(spec.elements ?? {})) {
    const path = element.props?.statePath
    if (typeof path !== 'string') continue
    const root = path.trim().split('.')[0]
    if (root) bound.add(root)
  }
  const found: Array<{ key: string; items: unknown[] }> = []
  for (const [key, value] of Object.entries(state)) {
    if (HOST_STATE_KEYS.has(key) || bound.has(key)) continue
    if (!Array.isArray(value) || value.length === 0) continue
    const records = value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    if (!records) continue
    found.push({ key, items: value })
  }
  return found
}
