/**
 * Backend chart builders for ads data.
 *
 * Architecture: ONE shared engine (`buildChartsFromTable`) + two thin adapters
 * that normalize each provider's row shape into a common flat table:
 *
 *   Google Ads  (nested: campaign.name, metrics.clicks, segments.date)
 *   Facebook Ads (flat insights: campaign_name, spend, date_start)
 *        │
 *        ▼  normalize → NormalizedRow[]
 *   buildChartsFromTable()  → ChartSpec[]   (type/axes/series decided here)
 *
 * The frontend never computes chart logic; it only renders these specs. Charts
 * are built deterministically (no LLM), so this is fast, free, and can't
 * hallucinate a broken chart.
 */

import type { ChartSpec, ChartType } from './chart-types'

/** A flattened row: dimension label(s) + numeric metrics. */
interface NormalizedRow {
  /** Primary category label (e.g. campaign name). */
  label: string
  /** ISO-ish date string if this row is part of a time series. */
  date?: string
  /** Numeric metrics keyed by a human-friendly display name. */
  metrics: Record<string, number>
}

interface BuildOptions {
  /** Title prefix used on generated charts (e.g. "Google Ads"). */
  titlePrefix?: string
  /** Cap on number of categories/series to keep charts readable. */
  maxCategories?: number
}

interface FunnelStage {
  label: string
  value: number
}

const DEFAULT_MAX_CATEGORIES = 12
const MAX_CATEGORY_LABEL_LEN = 28

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Short display label for long campaign/ad names; full name kept for tooltips. */
function shortenCampaignLabel(label: string, maxLen = MAX_CATEGORY_LABEL_LEN): string {
  let s = String(label).trim()
  s = s.replace(/^P2_/i, '')
  s = s.replace(/_/g, ' ')
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1)}…`
}

function formatCategoryLabels(labels: string[]): { short: string[]; full: string[] } {
  const full = labels.map((l) => String(l))
  return { short: full.map((l) => shortenCampaignLabel(l)), full }
}

/** Professional display order: spend/volume first, efficiency, conversions, then any new metric. */
const METRIC_ORDER: ReadonlyArray<{ test: RegExp; order: number }> = [
  { test: /spend|cost/i, order: 0 },
  { test: /^impressions$/i, order: 10 },
  { test: /^clicks$/i, order: 11 },
  { test: /^reach$/i, order: 12 },
  { test: /ctr/i, order: 20 },
  { test: /cpc/i, order: 21 },
  { test: /cpm/i, order: 22 },
  { test: /frequency/i, order: 23 },
  { test: /conv/i, order: 30 },
]

const OVERVIEW_METRIC_COUNT = 2
const MAX_PIE_SHARE_CHARTS = 3

function metricKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'metric'
}

function humanizeMetricKey(key: string): string {
  const cleaned = key.replace(/_/g, ' ').trim()
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
}

function orderMetrics(metricNames: string[]): string[] {
  return [...metricNames].sort((a, b) => {
    const pa = METRIC_ORDER.find((p) => p.test.test(a))?.order ?? 50
    const pb = METRIC_ORDER.find((p) => p.test.test(b))?.order ?? 50
    if (pa !== pb) return pa - pb
    return a.localeCompare(b)
  })
}

function sortRowsByMetric(rows: NormalizedRow[], metricName: string): NormalizedRow[] {
  return [...rows].sort(
    (a, b) => (b.metrics[metricName] ?? 0) - (a.metrics[metricName] ?? 0)
  )
}

/** Metrics that make sense as campaign share pies (additive totals). */
function pickPieShareMetrics(metricNames: string[]): string[] {
  const preferred = [
    'Spend ($)',
    'Cost ($)',
    'Spend',
    'Cost',
    'Impressions',
    'Clicks',
    'Reach',
    'Conversions',
  ]
  return preferred.filter((m) => metricNames.includes(m)).slice(0, MAX_PIE_SHARE_CHARTS)
}

/**
 * Shared engine: turn a normalized table into chart specs.
 *
 * Decision rules (deterministic):
 *  - If rows carry dates → one LINE chart per metric over time.
 *  - Else (categories):
 *      START  — overview charts for top 2 metrics (sorted by value)
 *      MIDDLE — one horizontal BAR per metric (every metric gets its own chart)
 *      END    — share PIE(s) for additive metrics + FUNNEL when stages exist
 *  - Any new numeric metric from the API is picked up automatically and charted.
 */
export function buildChartsFromTable(
  rows: NormalizedRow[],
  options: BuildOptions = {}
): ChartSpec[] {
  const { titlePrefix = 'Performance', maxCategories = DEFAULT_MAX_CATEGORIES } = options
  if (!rows || rows.length === 0) return []

  const metricNames = orderMetrics(collectMetricNames(rows))
  if (metricNames.length === 0) return []

  const distinctDates = new Set(rows.map((r) => r.date).filter((d): d is string => !!d))
  const hasDates = distinctDates.size >= 2
  const limited = rows.slice(0, maxCategories)
  const specs: ChartSpec[] = []

  if (hasDates) {
    for (let i = 0; i < metricNames.length; i++) {
      const metric = metricNames[i]
      const isOverview = i < OVERVIEW_METRIC_COUNT
      specs.push(
        buildTimeSeries(
          rows,
          [metric],
          `ts-${titlePrefix}-${metricKey(metric)}`,
          isOverview
            ? `${titlePrefix} — Overview: ${metric} over time`
            : `${titlePrefix} — ${metric} over time`
        )
      )
    }
  } else {
    // START + MIDDLE: one dedicated chart per metric, campaigns sorted by that metric.
    for (let i = 0; i < metricNames.length; i++) {
      const metric = metricNames[i]
      const sorted = sortRowsByMetric(limited, metric)
      const isOverview = i < OVERVIEW_METRIC_COUNT && limited.length > 1
      specs.push(
        buildSingleMetricBar(
          sorted,
          metric,
          `bar-${titlePrefix}-${metricKey(metric)}`,
          isOverview
            ? `${titlePrefix} — Overview: ${metric} by campaign`
            : `${titlePrefix} — ${metric} by campaign`
        )
      )
    }

    // END: share pies for key additive metrics.
    if (limited.length > 1) {
      for (const shareMetric of pickPieShareMetrics(metricNames)) {
        specs.push(buildSharePie(limited, shareMetric, titlePrefix))
      }
    }
  }

  const funnel = buildFunnelChart(rows, metricNames, titlePrefix)
  if (funnel) specs.push(funnel)

  return specs.filter((s) => s.series.some((series) => series.data.length > 0))
}

function collectMetricNames(rows: NormalizedRow[]): string[] {
  const names = new Set<string>()
  for (const row of rows) {
    for (const [k, v] of Object.entries(row.metrics)) {
      if (isFiniteNumber(v)) names.add(k)
    }
  }
  return Array.from(names)
}

/** Merge known metric labels with any extra numeric fields from the API row. */
function mergeDynamicMetrics(
  row: Record<string, unknown>,
  metrics: Record<string, number>,
  knownKeys: Set<string>,
  skipKeys: Set<string>
): void {
  for (const [key, val] of Object.entries(row)) {
    if (knownKeys.has(key) || skipKeys.has(key)) continue
    const n = toNumber(val)
    if (n !== undefined) metrics[humanizeMetricKey(key)] = n
  }
}

const FACEBOOK_SKIP_KEYS = new Set([
  'campaign_name',
  'adset_name',
  'ad_name',
  'account_name',
  'account_id',
  'date_start',
  'date_stop',
  'paging',
  'data',
])

function pickFunnelMetric(metricNames: string[], candidates: string[]): string | undefined {
  return candidates.find((name) => metricNames.includes(name))
}

function buildFunnelStages(rows: NormalizedRow[], metricNames: string[]): FunnelStage[] {
  const stageDefs: ReadonlyArray<{ label: string; candidates: string[] }> = [
    { label: 'Reach', candidates: ['Reach'] },
    { label: 'Impressions', candidates: ['Impressions'] },
    { label: 'Clicks', candidates: ['Clicks'] },
    { label: 'Conversions', candidates: ['Conversions', 'Conv. Value'] },
  ]

  const stages: FunnelStage[] = []
  for (const def of stageDefs) {
    const metric = pickFunnelMetric(metricNames, def.candidates)
    if (!metric) continue
    const total = rows.reduce((sum, row) => {
      const v = row.metrics[metric]
      return sum + (isFiniteNumber(v) ? v : 0)
    }, 0)
    if (total > 0) stages.push({ label: def.label, value: round2(total) })
  }

  if (stages.length < 2) return []

  // Keep the sequence monotonic for a clean top-to-bottom funnel shape.
  const monotonic: FunnelStage[] = []
  let prev = Number.POSITIVE_INFINITY
  for (const stage of stages) {
    const clamped = Math.min(stage.value, prev)
    monotonic.push({ ...stage, value: round2(clamped) })
    prev = clamped
  }
  return monotonic
}

function buildFunnelChart(rows: NormalizedRow[], metricNames: string[], titlePrefix: string): ChartSpec | null {
  const stages = buildFunnelStages(rows, metricNames)
  if (stages.length < 2) return null
  return {
    id: `funnel-${titlePrefix}`,
    type: 'funnel',
    title: `${titlePrefix} funnel`,
    series: [
      {
        name: 'Expected',
        type: 'funnel',
        data: stages.map((s) => ({ name: s.label, value: s.value })),
      },
    ],
    legend: true,
  }
}

function buildTimeSeries(
  rows: NormalizedRow[],
  metricNames: string[],
  id: string,
  title: string
): ChartSpec {
  // Aggregate by date (sum metrics for the same date across rows).
  const byDate = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const date = row.date ?? ''
    if (!date) continue
    const bucket = byDate.get(date) ?? {}
    for (const name of metricNames) {
      const v = row.metrics[name]
      if (isFiniteNumber(v)) bucket[name] = round2((bucket[name] ?? 0) + v)
    }
    byDate.set(date, bucket)
  }

  const dates = Array.from(byDate.keys()).sort()
  const series = metricNames.map((name) => ({
    name,
    type: 'line' as ChartType,
    data: dates.map((d) => byDate.get(d)?.[name] ?? 0),
  }))

  return {
    id,
    type: 'line',
    title,
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value' },
    series,
    legend: series.length > 1,
  }
}

function buildSingleMetricBar(
  rows: NormalizedRow[],
  metricName: string,
  id: string,
  title: string
): ChartSpec {
  return buildCategoryBar(rows, [metricName], id, title)
}

function buildCategoryBar(
  rows: NormalizedRow[],
  metricNames: string[],
  id: string,
  title: string
): ChartSpec {
  const { short, full } = formatCategoryLabels(rows.map((r) => r.label))
  const series = metricNames.map((name) => ({
    name,
    type: 'bar' as ChartType,
    data: rows.map((r) => (isFiniteNumber(r.metrics[name]) ? round2(r.metrics[name]) : 0)),
  }))

  return {
    id,
    type: 'bar',
    title,
    horizontal: true,
    categoryFullLabels: full,
    xAxis: { type: 'category', data: short },
    yAxis: { type: 'value' },
    series,
    legend: series.length > 1,
    height: Math.min(480, Math.max(280, rows.length * 40 + 100)),
  }
}

function buildSharePie(
  rows: NormalizedRow[],
  metricName: string,
  titlePrefix: string
): ChartSpec {
  return {
    id: `pie-${titlePrefix}-${metricName}`,
    type: 'pie',
    title: `${titlePrefix}: ${metricName} share`,
    series: [
      {
        name: metricName,
        type: 'pie',
        data: rows.map((r) => {
          const full = String(r.label)
          return {
            name: shortenCampaignLabel(full),
            fullName: full,
            value: isFiniteNumber(r.metrics[metricName]) ? round2(r.metrics[metricName]) : 0,
          }
        }),
      },
    ],
    legend: true,
  }
}

// ---------------------------------------------------------------------------
// Google Ads adapter
// ---------------------------------------------------------------------------

/** Human-friendly display names for common Google Ads metrics. */
const GOOGLE_METRIC_LABELS: Record<string, string> = {
  clicks: 'Clicks',
  impressions: 'Impressions',
  conversions: 'Conversions',
  conversionsValue: 'Conv. Value',
  cost_dollars: 'Cost ($)',
  ctr: 'CTR (%)',
  average_cpc_dollars: 'Avg CPC ($)',
}

function pick(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((cur, seg) => (cur == null ? cur : cur[seg]), obj)
}

function normalizeGoogleRow(row: any): NormalizedRow | null {
  if (!row || typeof row !== 'object') return null

  const label =
    (pick(row, 'campaign.name') as string) ??
    (pick(row, 'adGroup.name') as string) ??
    (pick(row, 'adGroupAd.ad.name') as string) ??
    (pick(row, 'customer.descriptiveName') as string) ??
    'Total'

  const date =
    (pick(row, 'segments.date') as string) ?? (pick(row, 'segments.week') as string) ?? undefined

  const rawMetrics = (row.metrics ?? {}) as Record<string, unknown>
  const metrics: Record<string, number> = {}
  for (const [key, display] of Object.entries(GOOGLE_METRIC_LABELS)) {
    const v = rawMetrics[key]
    if (isFiniteNumber(v)) metrics[display] = v
  }
  mergeDynamicMetrics(rawMetrics, metrics, new Set(Object.keys(GOOGLE_METRIC_LABELS)), new Set())

  if (Object.keys(metrics).length === 0) return null
  return { label: String(label), date, metrics }
}

/** Build chart specs from processed Google Ads V1 result rows. */
export function buildGoogleAdsVisualizations(rows: any[]): ChartSpec[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const normalized = rows
    .map(normalizeGoogleRow)
    .filter((r): r is NormalizedRow => r !== null)
  return buildChartsFromTable(normalized, { titlePrefix: 'Google Ads' })
}

// ---------------------------------------------------------------------------
// Facebook Ads adapter
// ---------------------------------------------------------------------------

/** Human-friendly display names for common Facebook Ads insight fields. */
const FACEBOOK_METRIC_LABELS: Record<string, string> = {
  spend: 'Spend ($)',
  impressions: 'Impressions',
  clicks: 'Clicks',
  reach: 'Reach',
  ctr: 'CTR (%)',
  cpc: 'CPC ($)',
  cpm: 'CPM ($)',
  frequency: 'Frequency',
}

function toNumber(v: unknown): number | undefined {
  if (isFiniteNumber(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function normalizeFacebookRow(row: any): NormalizedRow | null {
  if (!row || typeof row !== 'object') return null

  const label =
    row.campaign_name ??
    row.adset_name ??
    row.ad_name ??
    row.account_name ??
    'Total'

  const date = row.date_start ?? undefined

  const metrics: Record<string, number> = {}
  for (const [key, display] of Object.entries(FACEBOOK_METRIC_LABELS)) {
    const n = toNumber(row[key])
    if (n !== undefined) metrics[display] = n
  }
  mergeDynamicMetrics(row, metrics, new Set(Object.keys(FACEBOOK_METRIC_LABELS)), FACEBOOK_SKIP_KEYS)

  if (Object.keys(metrics).length === 0) return null
  return { label: String(label), date, metrics }
}

/**
 * Build chart specs from a Facebook Ads API result.
 * Accepts either the raw result (`{ data: [...] }`) or an insights array.
 */
export function buildFacebookAdsVisualizations(result: any): ChartSpec[] {
  const insights: any[] = Array.isArray(result)
    ? result
    : Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.data?.data)
        ? result.data.data
        : []

  if (insights.length === 0) return []
  const normalized = insights
    .map(normalizeFacebookRow)
    .filter((r): r is NormalizedRow => r !== null)
  return buildChartsFromTable(normalized, { titlePrefix: 'Facebook Ads' })
}
