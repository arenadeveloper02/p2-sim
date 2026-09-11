/**
 * Nested outline for the GUI host Tree widget. Expand/collapse stays in the host.
 */

const CHILDREN_KEYS = ['children', 'items', 'nodes', 'folders'] as const
const TITLE_KEYS = ['title', 'name', 'label', 'text'] as const

export interface TreeNode {
  item: unknown
  index: number
  id: string
  title: string
  children: TreeNode[]
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function firstMatchingKey(
  items: readonly unknown[],
  keys: readonly string[],
  accept: (value: unknown) => boolean
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of keys) {
      if (accept(record[key])) return key
    }
  }
  return keys[0] ?? ''
}

export function defaultTreeChildrenField(items: readonly unknown[]): string {
  return firstMatchingKey(items, CHILDREN_KEYS, Array.isArray)
}

export function defaultTreeTitleField(
  items: readonly unknown[],
  childrenField: string
): string {
  return firstMatchingKey(
    items,
    TITLE_KEYS.filter((key) => key !== childrenField),
    (value) => typeof value === 'string' && value.trim().length > 0
  )
}

function nodeId(item: unknown, index: number, prefix: string): string {
  const record = recordFromUnknown(item)
  const raw = record?.id
  const local = typeof raw === 'string' && raw.trim() ? raw.trim() : String(index)
  return prefix ? `${prefix}.${local}` : local
}

function titleFromItem(item: unknown, titleField: string, index: number): string {
  if (typeof item === 'string' && item.trim()) return item.trim()
  const record = recordFromUnknown(item)
  const titleRaw = record?.[titleField]
  if (typeof titleRaw === 'string' && titleRaw.trim()) return titleRaw.trim()
  if (typeof record?.name === 'string' && record.name.trim()) return record.name.trim()
  return `Item ${index + 1}`
}

function childrenFromItem(item: unknown, childrenField: string): unknown[] {
  const record = recordFromUnknown(item)
  const nested = record?.[childrenField]
  return Array.isArray(nested) ? nested : []
}

export function treeNodesFromCollection(
  items: readonly unknown[],
  childrenField: string,
  titleField: string,
  prefix = ''
): TreeNode[] {
  return items.map((item, index) => {
    const id = nodeId(item, index, prefix)
    const nested = childrenFromItem(item, childrenField)
    return {
      item,
      index,
      id,
      title: titleFromItem(item, titleField, index),
      children: treeNodesFromCollection(nested, childrenField, titleField, id),
    }
  })
}

export function treeRootIds(nodes: readonly TreeNode[]): string[] {
  return nodes.map((node) => node.id)
}
