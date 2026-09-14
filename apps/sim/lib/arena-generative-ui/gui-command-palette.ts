/**
 * Command palette rows: newline "Label|path" navigates; "Label|#actionId" or
 * "Label|action:id" runs a manifest action. Bound rows use title/path/action fields.
 */

import {
  collectionItemLabel,
  collectionItemText,
  defaultCollectionTitleField,
  recordFromUnknown,
} from '@/lib/arena-generative-ui/gui-collection-fields'

export type CommandPaletteKind = 'navigate' | 'action'

export interface CommandPaletteEntry {
  label: string
  kind: CommandPaletteKind
  target: string
}

const PATH_KEYS = ['path', 'to', 'href', 'target'] as const
const ACTION_KEYS = ['actionId', 'action', 'command'] as const

function parseTarget(raw: string): { kind: CommandPaletteKind; target: string } | null {
  const target = raw.trim()
  if (!target) return null
  if (target.startsWith('#')) {
    const id = target.slice(1).trim()
    return id ? { kind: 'action', target: id } : null
  }
  if (target.toLowerCase().startsWith('action:')) {
    const id = target.slice('action:'.length).trim()
    return id ? { kind: 'action', target: id } : null
  }
  return { kind: 'navigate', target }
}

export function parseCommandPaletteItems(raw: unknown): CommandPaletteEntry[] {
  if (typeof raw !== 'string') return []
  const items: CommandPaletteEntry[] = []
  for (const line of raw.split('\n')) {
    const row = line.trim()
    if (!row) continue
    const separator = row.indexOf('|')
    const label = (separator >= 0 ? row.slice(0, separator) : row).trim()
    const rest = (separator >= 0 ? row.slice(separator + 1) : row).trim()
    if (!label) continue
    const parsed = parseTarget(rest)
    if (!parsed) continue
    items.push({ label, kind: parsed.kind, target: parsed.target })
  }
  return items
}

export function defaultCommandPaletteTitleField(items: readonly unknown[]): string {
  return defaultCollectionTitleField(items)
}

export function defaultCommandPalettePathField(
  items: readonly unknown[],
  titleField: string
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of PATH_KEYS) {
      if (key === titleField) continue
      if (collectionItemText(item, key)) return key
    }
  }
  return ''
}

export function defaultCommandPaletteActionField(
  items: readonly unknown[],
  titleField: string
): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of ACTION_KEYS) {
      if (key === titleField) continue
      if (collectionItemText(item, key)) return key
    }
  }
  return ''
}

export function commandPaletteEntriesFromCollection(
  items: readonly unknown[],
  titleField: string,
  pathField: string,
  actionField: string
): CommandPaletteEntry[] {
  const entries: CommandPaletteEntry[] = []
  for (const [index, item] of items.entries()) {
    const label = collectionItemLabel(item, index, titleField, 'Command')
    const action = actionField ? collectionItemText(item, actionField) : ''
    if (action) {
      entries.push({ label, kind: 'action', target: action })
      continue
    }
    const path = pathField ? collectionItemText(item, pathField) : ''
    if (path) entries.push({ label, kind: 'navigate', target: path })
  }
  return entries
}

export function filterCommandPaletteEntries(
  entries: readonly CommandPaletteEntry[],
  query: string
): CommandPaletteEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...entries]
  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) || entry.target.toLowerCase().includes(needle)
  )
}
