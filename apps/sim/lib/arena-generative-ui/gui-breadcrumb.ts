/**
 * Breadcrumb items: newline "Label|path" like Tabs. A line without "|" is the
 * current crumb (no link).
 */

export interface BreadcrumbEntry {
  label: string
  path: string | null
}

export function parseBreadcrumbItems(raw: unknown): BreadcrumbEntry[] {
  if (typeof raw !== 'string') return []
  const items: BreadcrumbEntry[] = []
  for (const line of raw.split('\n')) {
    const row = line.trim()
    if (!row) continue
    const separator = row.indexOf('|')
    if (separator < 0) {
      items.push({ label: row, path: null })
      continue
    }
    const label = row.slice(0, separator).trim()
    const path = row.slice(separator + 1).trim()
    if (!label) continue
    items.push({ label, path: path || null })
  }
  return items
}
