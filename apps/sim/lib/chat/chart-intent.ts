/**
 * Parses user chat queries to decide which charts to build.
 *
 * Default: full dashboard (all charts from buildChartsFromTable).
 * Filtered: only chart types / metrics the user explicitly asked for.
 */

import type { ChartSpec } from './chart-types'

export type ChartIntentChartType = 'bar' | 'line' | 'pie' | 'funnel'

export interface ChartIntent {
  mode: 'default' | 'filtered'
  /** Empty in default mode. */
  chartTypes: ChartIntentChartType[]
  /** Human-friendly metric labels requested (e.g. "Spend ($)", "Clicks"). */
  metrics: string[]
}

type MetricAlias = {
  /** Regexes tested against the lowercased query. */
  patterns: RegExp[]
  /** Labels used in ChartSpec titles / series (any match counts). */
  labels: string[]
  /** Short tokens for loose title matching. */
  tokens: string[]
}

const METRIC_ALIASES: MetricAlias[] = [
  {
    patterns: [/\bspend\b/, /\bad\s*spend\b/],
    labels: ['Spend ($)', 'Spend'],
    tokens: ['spend'],
  },
  {
    patterns: [/\bcost\b/],
    labels: ['Cost ($)', 'Cost'],
    tokens: ['cost'],
  },
  {
    patterns: [/\bimpressions?\b/],
    labels: ['Impressions'],
    tokens: ['impressions'],
  },
  {
    patterns: [/\bclicks?\b/],
    labels: ['Clicks'],
    tokens: ['clicks', 'click'],
  },
  {
    patterns: [/\breach\b/],
    labels: ['Reach'],
    tokens: ['reach'],
  },
  {
    patterns: [/\bctr\b/, /\bclick[-\s]?through\s*rate\b/],
    labels: ['CTR (%)', 'CTR'],
    tokens: ['ctr'],
  },
  {
    patterns: [/\bcpc\b/, /\bcost\s+per\s+click\b/],
    labels: ['CPC ($)', 'CPC', 'Avg CPC ($)'],
    tokens: ['cpc'],
  },
  {
    patterns: [/\bcpm\b/, /\bcost\s+per\s+mille\b/],
    labels: ['CPM ($)', 'CPM'],
    tokens: ['cpm'],
  },
  {
    patterns: [/\bfrequency\b/],
    labels: ['Frequency'],
    tokens: ['frequency'],
  },
  {
    patterns: [/\broas\b/, /\breturn\s+on\s+ad\s+spend\b/],
    labels: ['ROAS', 'Purchase ROAS', 'Roas'],
    tokens: ['roas'],
  },
  {
    patterns: [/\bconversions?\b/, /\bconv\.?\b/],
    labels: ['Conversions', 'Conv. Value'],
    tokens: ['conversions', 'conversion', 'conv'],
  },
]

const CHART_TYPE_DETECTORS: ReadonlyArray<{ type: ChartIntentChartType; pattern: RegExp }> = [
  { type: 'pie', pattern: /\b(pie|donut)\b/ },
  { type: 'bar', pattern: /\b(bar|bars|column|columns|histogram)\b/ },
  { type: 'line', pattern: /\b(line|lines|trend|over\s+time)\b/ },
  { type: 'funnel', pattern: /\bfunnel\b/ },
]

function detectChartTypes(queryLower: string): ChartIntentChartType[] {
  const types: ChartIntentChartType[] = []
  for (const { type, pattern } of CHART_TYPE_DETECTORS) {
    if (pattern.test(queryLower)) types.push(type)
  }
  return types
}

function detectMetrics(queryLower: string): string[] {
  const labels = new Set<string>()
  for (const alias of METRIC_ALIASES) {
    if (alias.patterns.some((p) => p.test(queryLower))) {
      for (const label of alias.labels) labels.add(label)
    }
  }
  return Array.from(labels)
}

/**
 * True when the user is asking for specific chart(s), not a generic performance report.
 */
function wantsExplicitCharts(queryLower: string, chartTypes: ChartIntentChartType[]): boolean {
  if (chartTypes.length === 0) return false

  const hasChartWord = /\b(chart|charts|graph|graphs|visuali[sz]ation|visuali[sz]e)\b/.test(
    queryLower
  )
  const hasOnlyJust = /\b(only|just)\b/.test(queryLower)
  const hasInChartPhrase = /\bin\s+(a\s+)?(pie|bar|line|funnel|donut)\b/.test(queryLower)
  const hasPieChartOf = /\b(pie|bar|line|funnel)\s+chart\b/.test(queryLower)

  return hasChartWord || hasOnlyJust || hasInChartPhrase || hasPieChartOf
}

/**
 * Parse natural-language chart intent from the user's query (Start input / block query).
 */
export function parseChartIntent(query: string | undefined | null): ChartIntent {
  const empty: ChartIntent = { mode: 'default', chartTypes: [], metrics: [] }
  if (!query || !String(query).trim()) return empty

  const q = String(query).toLowerCase()
  const chartTypes = detectChartTypes(q)
  const metrics = detectMetrics(q)

  if (!wantsExplicitCharts(q, chartTypes)) {
    return empty
  }

  return {
    mode: 'filtered',
    chartTypes,
    metrics,
  }
}

function specSearchText(spec: ChartSpec): string {
  const parts = [
    spec.id ?? '',
    spec.title ?? '',
    spec.subtitle ?? '',
    ...spec.series.map((s) => s.name ?? ''),
  ]
  return parts.join(' ').toLowerCase()
}

function specMatchesMetrics(spec: ChartSpec, metrics: string[]): boolean {
  if (metrics.length === 0) return true
  if (spec.type === 'funnel') return true

  const haystack = specSearchText(spec)

  return metrics.some((metric) => {
    const ml = metric.toLowerCase()
    if (haystack.includes(ml)) return true

    const alias = METRIC_ALIASES.find((a) => a.labels.some((l) => l.toLowerCase() === ml))
    if (alias) {
      return alias.tokens.some((t) => haystack.includes(t))
    }

    const tokens = ml.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    return tokens.some((t) => t.length > 2 && haystack.includes(t))
  })
}

/**
 * Filter built chart specs according to parsed intent.
 * Falls back to chart-type-only match if metric filter removes everything.
 */
export function applyChartIntent(specs: ChartSpec[], intent: ChartIntent): ChartSpec[] {
  if (intent.mode === 'default' || specs.length === 0) return specs

  let result = specs

  if (intent.chartTypes.length > 0) {
    const allowed = new Set(intent.chartTypes)
    result = result.filter((s) => allowed.has(s.type as ChartIntentChartType))
  }

  if (intent.metrics.length > 0) {
    const withMetrics = result.filter((s) => specMatchesMetrics(s, intent.metrics))
    if (withMetrics.length > 0) {
      result = withMetrics
    }
  }

  return result
}
