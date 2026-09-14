/**
 * Shared title / group field discovery for bound collection widgets
 * (Kanban, Filmstrip, List).
 */

const TITLE_KEYS = ['title', 'name', 'label', 'summary', 'text', 'heading', 'time'] as const
const GROUP_KEYS = ['status', 'column', 'lane', 'state', 'group', 'stage'] as const

export function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function defaultCollectionTitleField(
  items: readonly unknown[],
  exclude: ReadonlySet<string> = new Set()
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of TITLE_KEYS) {
      if (exclude.has(key)) continue
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return key
    }
    for (const [key, value] of Object.entries(record)) {
      if (exclude.has(key)) continue
      if (typeof value === 'string' && value.trim()) return key
    }
  }
  return 'title'
}

export function defaultCollectionGroupField(items: readonly unknown[]): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of GROUP_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return key
    }
  }
  return 'status'
}

export function collectionItemLabel(
  item: unknown,
  index: number,
  field: string,
  fallbackPrefix = 'Item'
): string {
  const record = recordFromUnknown(item)
  const raw = record?.[field]
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof record?.name === 'string' && record.name.trim()) return record.name.trim()
  return `${fallbackPrefix} ${index + 1}`
}

export function collectionItemText(item: unknown, field: string): string {
  const record = recordFromUnknown(item)
  const raw = record?.[field]
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return ''
}
