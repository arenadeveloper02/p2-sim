import {
  collectionItemLabel,
  defaultCollectionGroupField,
  defaultCollectionTitleField,
  recordFromUnknown,
} from '@/lib/arena-generative-ui/gui-collection-fields'

export const KANBAN_UNASSIGNED_COLUMN = 'Unassigned'

export interface KanbanCard {
  item: unknown
  index: number
  title: string
}

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

function parseColumnOrder(columns: string | undefined): string[] {
  if (!columns) return []
  return columns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
}

export function kanbanColumnsForCollection(
  items: readonly unknown[],
  groupField: string,
  titleField: string,
  columns?: string
): KanbanColumn[] {
  const order = parseColumnOrder(columns)
  const buckets = new Map<string, KanbanCard[]>()
  for (const id of order) buckets.set(id, [])
  items.forEach((item, index) => {
    const record = recordFromUnknown(item)
    const groupRaw = record?.[groupField]
    const group =
      typeof groupRaw === 'string' && groupRaw.trim()
        ? groupRaw.trim()
        : KANBAN_UNASSIGNED_COLUMN
    const card: KanbanCard = {
      item,
      index,
      title: collectionItemLabel(item, index, titleField),
    }
    const bucket = buckets.get(group) ?? []
    bucket.push(card)
    buckets.set(group, bucket)
  })
  const seen = new Set(order)
  const extras = [...buckets.keys()].filter((id) => !seen.has(id))
  extras.sort((left, right) => {
    if (left === KANBAN_UNASSIGNED_COLUMN) return 1
    if (right === KANBAN_UNASSIGNED_COLUMN) return -1
    return left.localeCompare(right)
  })
  return [...order, ...extras].map((id) => ({
    id,
    title: id,
    cards: buckets.get(id) ?? [],
  }))
}

export function defaultKanbanGroupField(items: readonly unknown[]): string {
  return defaultCollectionGroupField(items)
}

export function defaultKanbanTitleField(items: readonly unknown[], groupField: string): string {
  return defaultCollectionTitleField(items, new Set([groupField]))
}
