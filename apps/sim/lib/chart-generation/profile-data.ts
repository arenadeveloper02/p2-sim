import type { DataProfile, FieldKind, FieldProfile } from '@/lib/chart-generation/types'

const DATE_FIELD_PATTERN =
  /^(date|time|timestamp|datetime|month|year|week|day|created|updated|period)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function getByPath(value: unknown, path?: string): unknown {
  if (!path?.trim()) {
    return value
  }

  let current: unknown = value
  for (const segment of path.split('.')) {
    if (!segment) continue
    if (!isRecord(current) && !Array.isArray(current)) {
      return undefined
    }
    if (Array.isArray(current)) {
      const index = Number(segment)
      current = Number.isInteger(index) ? current[index] : undefined
      continue
    }
    current = current[segment]
  }

  return current
}

function isDateLike(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime())
  }
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true
  const parsed = Date.parse(trimmed)
  return !Number.isNaN(parsed)
}

function inferFieldKind(name: string, values: unknown[]): FieldKind {
  const nonNull = values.filter((value) => value !== null && value !== undefined)
  if (nonNull.length === 0) {
    return DATE_FIELD_PATTERN.test(name) ? 'date' : 'unknown'
  }

  if (nonNull.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return 'number'
  }

  if (nonNull.every((value) => typeof value === 'boolean')) {
    return 'boolean'
  }

  if (nonNull.every((value) => isDateLike(value)) || DATE_FIELD_PATTERN.test(name)) {
    return 'date'
  }

  if (nonNull.every((value) => typeof value === 'string' || typeof value === 'number')) {
    return 'string'
  }

  return 'unknown'
}

function rowsFromArrayOfObjects(value: unknown[]): Record<string, unknown>[] {
  return value
    .filter((item) => isRecord(item))
    .map((item) => ({ ...item }))
}

function rowsFromParallelArrays(record: Record<string, unknown>): Record<string, unknown>[] | null {
  const arrayEntries = Object.entries(record).filter(([, entry]) => Array.isArray(entry))
  if (arrayEntries.length < 2) {
    return null
  }

  const lengths = arrayEntries.map(([, entry]) => (entry as unknown[]).length)
  const rowCount = Math.max(...lengths)
  if (rowCount === 0) {
    return null
  }

  return Array.from({ length: rowCount }, (_, index) => {
    const row: Record<string, unknown> = {}
    for (const [key, entry] of arrayEntries) {
      row[key] = (entry as unknown[])[index]
    }
    return row
  })
}

function rowsFromKeyValueRecord(record: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Object.entries(record).filter(
    ([, value]) => typeof value === 'number' || typeof value === 'string'
  )
  if (entries.length === 0) {
    return []
  }
  return entries.map(([key, value]) => ({ category: key, value }))
}

function findBestArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value
  }

  if (!isRecord(value)) {
    return null
  }

  let best: unknown[] | null = null
  let bestScore = -1

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      const objectRows = node.filter((item) => isRecord(item)).length
      const score = objectRows > 0 ? objectRows * 10 + node.length : node.length
      if (score > bestScore) {
        best = node
        bestScore = score
      }
      return
    }

    if (!isRecord(node)) {
      return
    }

    for (const child of Object.values(node)) {
      visit(child)
    }
  }

  visit(value)
  return best
}

export function normalizeChartData(data: unknown, dataPath?: string): Record<string, unknown>[] {
  const parsed = parseJsonValue(data)
  const targeted = getByPath(parsed, dataPath) ?? parsed

  if (Array.isArray(targeted)) {
    if (targeted.every((item) => typeof item === 'number')) {
      return targeted.map((value, index) => ({ index, value }))
    }
    if (targeted.every((item) => typeof item === 'string')) {
      return targeted.map((value, index) => ({ index, value }))
    }
    return rowsFromArrayOfObjects(targeted)
  }

  if (isRecord(targeted)) {
    const parallelRows = rowsFromParallelArrays(targeted)
    if (parallelRows && parallelRows.length > 0) {
      return parallelRows
    }

    const nestedArray = findBestArray(targeted)
    if (nestedArray) {
      return normalizeChartData(nestedArray)
    }

    return rowsFromKeyValueRecord(targeted)
  }

  return []
}

export function profileChartData(rows: Record<string, unknown>[]): DataProfile {
  if (rows.length === 0) {
    return { rows: [], fields: [], rowCount: 0 }
  }

  const fieldNames = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      fieldNames.add(key)
    }
  }

  const fields: FieldProfile[] = [...fieldNames].map((name) => {
    const values = rows.map((row) => row[name])
    const uniqueValues = new Set(values.map((value) => JSON.stringify(value)))
    return {
      name,
      kind: inferFieldKind(name, values),
      uniqueCount: uniqueValues.size,
      sampleValues: values.slice(0, 5),
    }
  })

  return {
    rows,
    fields,
    rowCount: rows.length,
  }
}
