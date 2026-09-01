import {
  collectionFromBoundValue,
  type RepeatItemScope,
  readScopedStatePath,
} from '@/lib/arena-generative-ui/types'
import {
  type ConstrainedChartDsl,
  type ConstrainedChartType,
  isConstrainedChartType,
} from '@/lib/chart-generation/constrained-echarts-option'

const MAX_CHART_POINTS = 60
const MAX_SERIES = 8
const DEFAULT_HEIGHT = 320
const MIN_HEIGHT = 160
const MAX_HEIGHT = 720
const CATEGORY_FALLBACKS = ['name', 'label', 'date'] as const

export interface BoundChartData {
  dsl: ConstrainedChartDsl | null
  height: number
  emptyText: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function splitCommaList(value: unknown): string[] {
  return asString(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseNumberList(value: unknown): number[] {
  return splitCommaList(value)
    .map((part) => Number(part))
    .filter((item) => Number.isFinite(item))
}

function clampHeight(value: unknown): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(raw)) return DEFAULT_HEIGHT
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, raw))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function numbersFromArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const numbers = value.map((item) => {
    if (typeof item === 'number' && Number.isFinite(item)) return item
    if (typeof item === 'string' && item.trim()) {
      const parsed = Number(item)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  })
  if (numbers.some((item) => item === null)) return null
  return (numbers as number[]).slice(0, MAX_CHART_POINTS)
}

function recordsFromValue(value: unknown): Record<string, unknown>[] {
  const collection = collectionFromBoundValue(value)
  const source = collection ?? (Array.isArray(value) ? value : null)
  if (!source) return []
  return source.filter(isRecord).slice(0, MAX_CHART_POINTS)
}

function firstStringField(row: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && value.trim()) return key
  }
  return undefined
}

function pickCategoryField(
  rows: Record<string, unknown>[],
  requested: string
): string | undefined {
  if (requested && rows.some((row) => row[requested] !== undefined)) return requested
  const sample = rows[0]
  if (!sample) return undefined
  for (const key of CATEGORY_FALLBACKS) {
    if (sample[key] !== undefined) return key
  }
  return firstStringField(sample)
}

function numericFields(rows: Record<string, unknown>[], exclude: Set<string>): string[] {
  const sample = rows[0]
  if (!sample) return []
  const keys: string[] = []
  for (const [key, value] of Object.entries(sample)) {
    if (exclude.has(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) keys.push(key)
    else if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      keys.push(key)
    }
  }
  return keys.slice(0, MAX_SERIES)
}

function categoryLabel(row: Record<string, unknown>, field: string, index: number): string {
  const value = row[field]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return `${index + 1}`
}

function dslFromRecords(
  rows: Record<string, unknown>[],
  chartType: ConstrainedChartType,
  categoryField: string,
  seriesKeys: string[],
  title: string | undefined,
  showLegend: boolean,
  stacked: boolean
): ConstrainedChartDsl | null {
  const keys = seriesKeys.slice(0, MAX_SERIES)
  if (keys.length === 0) return null
  const pie = chartType === 'pie'
  const usedKeys = pie ? keys.slice(0, 1) : keys
  return {
    ...(title ? { title } : {}),
    chartType,
    categories: rows.map((row, index) => categoryLabel(row, categoryField, index)),
    series: usedKeys.map((key) => ({
      name: key,
      data: rows.map((row) => toFiniteNumber(row[key])),
    })),
    showLegend,
    stacked: stacked && (chartType === 'bar' || chartType === 'area'),
  }
}

function dslFromNumbers(
  values: number[],
  chartType: ConstrainedChartType,
  seriesName: string,
  title: string | undefined,
  showLegend: boolean,
  stacked: boolean
): ConstrainedChartDsl {
  const categories = values.map((_, index) => `${index + 1}`)
  return {
    ...(title ? { title } : {}),
    chartType,
    categories,
    series: [{ name: seriesName || 'Series', data: values }],
    showLegend,
    stacked: stacked && (chartType === 'bar' || chartType === 'area'),
  }
}

/**
 * Resolves Chart catalog props plus host state into a constrained chart DSL.
 * Does not reshape the API payload — it only reads the already-lifted host key.
 */
export function bindChartData(
  props: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): BoundChartData {
  const emptyText = asString(props.emptyText) || 'No data'
  const height = clampHeight(props.height)
  const rawType = asString(props.chartType)
  const chartType: ConstrainedChartType = isConstrainedChartType(rawType) ? rawType : 'line'
  const title = asString(props.title) || undefined
  const stacked = asBoolean(props.stacked) === true
  const seriesNames = splitCommaList(props.series)
  const dummyCategories = splitCommaList(props.categories)
  const dummyValues = parseNumberList(props.values)
  const requestedLegend = asBoolean(props.showLegend)

  const finish = (dsl: ConstrainedChartDsl | null): BoundChartData => ({
    dsl,
    height,
    emptyText,
  })

  const withLegend = (seriesCount: number): boolean => {
    if (requestedLegend !== undefined) return requestedLegend
    return seriesCount > 1 || chartType === 'pie'
  }

  const statePath = asString(props.statePath)
  if (statePath) {
    const raw = readScopedStatePath(state, statePath, scope)
    const numbers = numbersFromArray(raw)
    if (numbers && numbers.length > 0) {
      const name = seriesNames[0] ?? title ?? 'Series'
      return finish(
        dslFromNumbers(numbers, chartType, name, title, withLegend(1), stacked)
      )
    }
    const rows = recordsFromValue(raw)
    if (rows.length === 0) return finish(null)
    const categoryField = pickCategoryField(rows, asString(props.categoryField))
    if (!categoryField) return finish(null)
    const exclude = new Set([categoryField])
    const keys =
      seriesNames.length > 0
        ? seriesNames.filter((key) => rows.some((row) => row[key] !== undefined))
        : numericFields(rows, exclude)
    return finish(
      dslFromRecords(rows, chartType, categoryField, keys, title, withLegend(keys.length), stacked)
    )
  }

  if (dummyValues.length === 0) return finish(null)
  const name = seriesNames[0] ?? title ?? 'Series'
  const dsl = dslFromNumbers(dummyValues, chartType, name, title, withLegend(1), stacked)
  if (dummyCategories.length > 0) {
    dsl.categories = dummyCategories.slice(0, dummyValues.length)
  }
  return finish(dsl)
}
