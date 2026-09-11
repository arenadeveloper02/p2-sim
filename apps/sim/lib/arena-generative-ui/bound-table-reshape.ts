/**
 * Host reshape for Table columns: computed index, stacked format/aggregate
 * pipes, footer totals, and parse-prose-into-rows. Unknown pipes pass through.
 */

import { isBoundRelativeDateFormat } from '@/lib/arena-generative-ui/bound-date-format'
import { formatBoundDisplay } from '@/lib/arena-generative-ui/bound-display'
import { isBoundNumberFormat, parseBoundNumber } from '@/lib/arena-generative-ui/bound-number-format'

export const BOUND_TABLE_AGGREGATES = ['sum', 'avg', 'min', 'max', 'count'] as const

export type BoundTableAggregate = (typeof BOUND_TABLE_AGGREGATES)[number]

const AGGREGATE_SET = new Set<string>(BOUND_TABLE_AGGREGATES)
const INDEX_KEYS = new Set(['#', 'index'])

export interface BoundTableColumn {
  key: string
  displayFormat?: string
  aggregate?: BoundTableAggregate
  indexColumn: boolean
}

export interface ParsedProseTable {
  headers: string[]
  records: Array<Record<string, unknown>>
}

export interface StatAggregate {
  op: BoundTableAggregate
  field: string
}

const MARKDOWN_ROW = /^\s*\|.*\|\s*$/
const MARKDOWN_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

/**
 * Splits `amount|currency|sum` or `#` into a closed column token.
 * Unknown extra pipes stay on `displayFormat` (same pass-through as today).
 */
export function parseBoundTableColumn(raw: string): BoundTableColumn {
  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  const key = parts[0] ?? raw.trim()
  const indexColumn = INDEX_KEYS.has(key.toLowerCase())
  let aggregate: BoundTableAggregate | undefined
  const displayParts: string[] = []
  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase()
    if (AGGREGATE_SET.has(lower)) {
      aggregate = lower as BoundTableAggregate
      continue
    }
    displayParts.push(part)
  }
  return {
    key,
    displayFormat: displayParts.length > 0 ? displayParts.join('|') : undefined,
    aggregate,
    indexColumn,
  }
}

export function parseBoundTableColumns(columns?: string): BoundTableColumn[] {
  return (columns ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseBoundTableColumn)
}

export function isComputedTableColumnKey(key: string): boolean {
  return INDEX_KEYS.has(key.trim().toLowerCase())
}

/** Header label: index columns render as `#`. */
export function boundTableColumnLabel(column: BoundTableColumn): string {
  return column.indexColumn ? '#' : column.key
}

export function tableColumnFieldKey(column: BoundTableColumn): string {
  return column.indexColumn ? '#' : column.key
}

/**
 * True when `format` is a host display pipe (number, relative date, or date preset).
 * Unknown tokens still pass through at format time.
 */
export function isBoundColumnDisplayFormat(format?: string): boolean {
  if (!format) return false
  if (isBoundNumberFormat(format) || isBoundRelativeDateFormat(format)) return true
  return /YYYY|MMMM|MMM|DD|MM|relative|ago|datetime|numeric/i.test(format)
}

export function tableCellValue(
  item: unknown,
  column: BoundTableColumn,
  visibleIndex: number
): unknown {
  if (column.indexColumn) return visibleIndex + 1
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return (item as Record<string, unknown>)[column.key]
  }
  return undefined
}

export function formatTableCellDisplay(
  value: unknown,
  column: BoundTableColumn,
  nowMs?: number
): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return formatBoundDisplay(String(value), column.displayFormat, { nowMs })
}

/**
 * Footer cell for one column. `count` is the row count. Numeric aggregates skip
 * non-numeric cells. Empty when the column has no aggregate pipe.
 */
export function aggregateTableColumn(
  items: readonly unknown[],
  column: BoundTableColumn
): number | undefined {
  if (!column.aggregate) return undefined
  if (column.aggregate === 'count' || column.indexColumn) return items.length
  const numbers: number[] = []
  for (const item of items) {
    const raw = tableCellValue(item, column, 0)
    const parsed =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : typeof raw === 'string'
          ? parseBoundNumber(raw)
          : undefined
    if (parsed !== undefined) numbers.push(parsed)
  }
  if (numbers.length === 0) return undefined
  if (column.aggregate === 'sum') return numbers.reduce((sum, value) => sum + value, 0)
  if (column.aggregate === 'avg') {
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  }
  if (column.aggregate === 'min') return Math.min(...numbers)
  return Math.max(...numbers)
}

/** `sum:amount` on Stat — total a collection field without an API `total`. */
export function parseStatAggregate(raw?: string): StatAggregate | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  const separator = trimmed.includes(':') ? ':' : trimmed.includes('|') ? '|' : ''
  if (!separator) return undefined
  const [opRaw, fieldRaw] = trimmed.split(separator, 2)
  const op = opRaw?.trim().toLowerCase()
  const field = fieldRaw?.trim()
  if (!field || !AGGREGATE_SET.has(op ?? '')) return undefined
  return { op: op as BoundTableAggregate, field }
}

export function aggregateStatCollection(
  items: readonly unknown[],
  spec: StatAggregate
): number | undefined {
  return aggregateTableColumn(items, {
    key: spec.field,
    aggregate: spec.op,
    indexColumn: false,
  })
}

/**
 * Parse a string into table rows. Order: markdown table, JSON array of objects,
 * CSV/TSV. Returns undefined when the value is not tabular.
 */
export function parseProseTable(value: unknown): ParsedProseTable | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return parseMarkdownTable(trimmed) ?? parseJsonObjectArray(trimmed) ?? parseDelimitedTable(trimmed)
}

function parseMarkdownTable(text: string): ParsedProseTable | undefined {
  const lines = text.split(/\r?\n/).filter((line) => MARKDOWN_ROW.test(line))
  if (lines.length < 2) return undefined
  const parsed = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
  )
  const headerLine = parsed[0]
  if (!headerLine || headerLine.length === 0) return undefined
  let dataStart = 1
  if (parsed[1] && MARKDOWN_DIVIDER.test(lines[1] ?? '')) dataStart = 2
  const headers = headerLine.filter(Boolean)
  if (headers.length === 0) return undefined
  const records: Array<Record<string, unknown>> = []
  for (const cells of parsed.slice(dataStart)) {
    if (cells.every((cell) => cell === '')) continue
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    records.push(record)
  }
  if (records.length === 0) return undefined
  return { headers, records }
}

function parseJsonObjectArray(text: string): ParsedProseTable | undefined {
  if (!(text.startsWith('[') || text.startsWith('{'))) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : undefined
    if (!rows || rows.length === 0) return undefined
    if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      return undefined
    }
    const headers: string[] = []
    for (const row of rows) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        if (!headers.includes(key)) headers.push(key)
      }
    }
    if (headers.length === 0) return undefined
    return { headers, records: rows as Array<Record<string, unknown>> }
  } catch {
    return undefined
  }
}

function parseDelimitedTable(text: string): ParsedProseTable | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return undefined
  const delimiter = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(',') ? ',' : ''
  if (!delimiter) return undefined
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()))
  const headers = (rows[0] ?? []).filter(Boolean)
  if (headers.length < 2) return undefined
  const records: Array<Record<string, unknown>> = []
  for (const cells of rows.slice(1)) {
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    records.push(record)
  }
  if (records.length === 0) return undefined
  return { headers, records }
}
