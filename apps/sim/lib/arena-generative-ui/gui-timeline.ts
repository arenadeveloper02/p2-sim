/**
 * Chronological spine for the GUI host Timeline widget. Reuses Calendar date
 * discovery so ISO-only values never shift by timezone.
 */

import {
  defaultCalendarDateField,
  defaultCalendarTitleField,
} from '@/lib/arena-generative-ui/gui-calendar'
import { boundIsoDateOnly } from '@/lib/arena-generative-ui/bound-date-format'

export interface TimelineEntry {
  item: unknown
  index: number
  iso?: string
  title: string
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function defaultTimelineDateField(items: readonly unknown[]): string {
  return defaultCalendarDateField(items)
}

export function defaultTimelineTitleField(items: readonly unknown[], dateField: string): string {
  return defaultCalendarTitleField(items, dateField)
}

export function timelineItemsForCollection(
  items: readonly unknown[],
  dateField: string,
  titleField: string
): { dated: TimelineEntry[]; undated: TimelineEntry[] } {
  const dated: TimelineEntry[] = []
  const undated: TimelineEntry[] = []
  items.forEach((item, index) => {
    const record = recordFromUnknown(item)
    const iso = boundIsoDateOnly(record?.[dateField])
    const titleRaw = record?.[titleField]
    const title =
      typeof titleRaw === 'string' && titleRaw.trim()
        ? titleRaw.trim()
        : typeof record?.name === 'string'
          ? record.name
          : `Item ${index + 1}`
    const entry: TimelineEntry = { item, index, iso: iso ?? undefined, title }
    if (!iso) {
      undated.push(entry)
      return
    }
    dated.push(entry)
  })
  dated.sort((left, right) => {
    const isoCmp = (left.iso ?? '').localeCompare(right.iso ?? '')
    return isoCmp !== 0 ? isoCmp : left.index - right.index
  })
  return { dated, undated }
}
