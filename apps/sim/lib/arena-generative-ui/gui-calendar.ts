/**
 * Calendar-stable month/week grids for GUI host DateInput and Calendar.
 * Uses local calendar days so date-only ISO values never shift by timezone.
 */

import { boundIsoDateOnly } from '@/lib/arena-generative-ui/bound-date-format'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export interface CalendarDay {
  iso: string
  year: number
  month: number
  day: number
  inMonth: boolean
}

export interface CalendarDateParts {
  year: number
  month: number
  day: number
}

export interface CalendarItem {
  item: unknown
  index: number
  iso?: string
  title: string
}

const TITLE_KEYS = ['title', 'name', 'label', 'summary', 'text', 'heading']

export function padIsoPart(value: number): string {
  return String(value).padStart(2, '0')
}

export function isoDateFromParts(year: number, month: number, day: number): string {
  return `${year}-${padIsoPart(month)}-${padIsoPart(day)}`
}

export function parseIsoDateParts(value: unknown): CalendarDateParts | undefined {
  const iso = boundIsoDateOnly(value) ?? (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : undefined)
  if (!iso) return undefined
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return { year, month, day }
}

export function addCalendarMonths(parts: CalendarDateParts, delta: number): CalendarDateParts {
  const date = new Date(parts.year, parts.month - 1 + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: 1 }
}

export function addCalendarDays(iso: string, delta: number): string {
  const parts = parseIsoDateParts(iso)
  if (!parts) return iso
  const date = new Date(parts.year, parts.month - 1, parts.day + delta)
  return isoDateFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function startOfWeekSunday(iso: string): string {
  const parts = parseIsoDateParts(iso)
  if (!parts) return iso
  const date = new Date(parts.year, parts.month - 1, parts.day)
  return addCalendarDays(iso, -date.getDay())
}

/**
 * Six-week (42-day) month grid starting Sunday. Days outside the month stay
 * labelled so the grid never jumps height.
 */
export function monthGridDays(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - first.getDay())
  const days: CalendarDay[] = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const cellYear = date.getFullYear()
    const cellMonth = date.getMonth() + 1
    const cellDay = date.getDate()
    days.push({
      iso: isoDateFromParts(cellYear, cellMonth, cellDay),
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
    })
  }
  return days
}

export function weekGridDays(iso: string): CalendarDay[] {
  const start = startOfWeekSunday(iso)
  const startParts = parseIsoDateParts(start)
  const anchor = parseIsoDateParts(iso)
  if (!startParts || !anchor) return []
  return Array.from({ length: 7 }, (_, index) => {
    const next = addCalendarDays(start, index)
    const parts = parseIsoDateParts(next)
    if (!parts) {
      return { iso: next, year: 0, month: 0, day: 0, inMonth: false }
    }
    return {
      iso: next,
      year: parts.year,
      month: parts.month,
      day: parts.day,
      inMonth: parts.month === anchor.month,
    }
  })
}

export function isoDateInRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false
  if (max && iso > max) return false
  return true
}

export function monthTitle(year: number, month: number): string {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function looksIsoish(value: unknown): boolean {
  return parseIsoDateParts(value) !== undefined
}

export function defaultCalendarDateField(items: readonly unknown[]): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of Object.keys(record)) {
      if (looksIsoish(record[key])) return key
    }
  }
  return 'date'
}

export function defaultCalendarTitleField(items: readonly unknown[], dateField: string): string {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    for (const key of TITLE_KEYS) {
      if (key === dateField) continue
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return key
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === dateField) continue
      if (typeof value === 'string' && value.trim()) return key
    }
  }
  return 'title'
}

export function calendarItemsForCollection(
  items: readonly unknown[],
  dateField: string,
  titleField: string
): { byDate: Map<string, CalendarItem[]>; unscheduled: CalendarItem[] } {
  const byDate = new Map<string, CalendarItem[]>()
  const unscheduled: CalendarItem[] = []
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
    const entry: CalendarItem = { item, index, iso: iso ?? undefined, title }
    if (!iso) {
      unscheduled.push(entry)
      return
    }
    const bucket = byDate.get(iso) ?? []
    bucket.push(entry)
    byDate.set(iso, bucket)
  })
  return { byDate, unscheduled }
}
