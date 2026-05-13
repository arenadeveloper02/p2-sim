/**
 * MCP tool handlers for GAQL schema discovery and validation.
 *
 * All schema reads go through the cache (`getSchema()`), which fetches live
 * data from GoogleAdsFieldService with a static fallback. Rules remain
 * static — they describe our internal quality gates, not the API surface.
 */

import { GAQL_RULES, isSnapshotResource } from '../schema/rules.js'
import type { GaqlMetric, GaqlResource, GaqlSegment } from '../schema/types.js'
import { getCacheMeta, getSchema, refreshSchema } from '../services/schema-cache.js'

function groupBy<T extends { category: string }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})
}

export async function handleGetSchema() {
  const schema = await getSchema()
  return {
    resources: schema.resources,
    metrics: schema.metrics,
    segments: schema.segments,
    rules: GAQL_RULES,
    counts: {
      resources: schema.resources.length,
      metrics: schema.metrics.length,
      segments: schema.segments.length,
      rules: GAQL_RULES.length,
    },
    source: getCacheMeta().source,
    apiVersion: schema.apiVersion,
    fetchedAt: schema.fetchedAt,
  }
}

export async function handleGetResources(args: { category?: string; search?: string }) {
  const schema = await getSchema()
  const byCategory = groupBy(schema.resources)
  let results: GaqlResource[] = args.category ? byCategory[args.category] ?? [] : schema.resources

  if (args.search) {
    const q = args.search.toLowerCase()
    results = results.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.fields.some((f) => f.toLowerCase().includes(q)),
    )
  }

  return {
    resources: results,
    count: results.length,
    categories: Object.keys(byCategory),
    source: getCacheMeta().source,
  }
}

export async function handleGetResource(args: { name: string }) {
  const schema = await getSchema()
  const resource = schema.resources.find((r) => r.name === args.name)
  if (!resource) {
    return {
      error: `Resource not found: ${args.name}`,
      available: schema.resources.map((r) => r.name),
    }
  }
  return { resource, source: getCacheMeta().source }
}

export async function handleGetMetrics(args: { category?: string; search?: string; resource?: string }) {
  const schema = await getSchema()
  const byCategory = groupBy(schema.metrics)
  let results: GaqlMetric[] = args.category ? byCategory[args.category] ?? [] : schema.metrics

  if (args.resource) {
    results = results.filter(
      (m) => m.compatibleResources?.includes(args.resource!),
    )
  }

  if (args.search) {
    const q = args.search.toLowerCase()
    results = results.filter(
      (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
    )
  }

  return {
    metrics: results,
    count: results.length,
    categories: Object.keys(byCategory),
    resource_filter: args.resource ?? null,
    source: getCacheMeta().source,
  }
}

export async function handleGetSegments(args: { category?: string; search?: string; resource?: string }) {
  const schema = await getSchema()
  const byCategory = groupBy(schema.segments)
  let results: GaqlSegment[] = args.category ? byCategory[args.category] ?? [] : schema.segments

  if (args.resource) {
    results = results.filter(
      (s) => s.compatibleResources?.includes(args.resource!),
    )
  }

  if (args.search) {
    const q = args.search.toLowerCase()
    results = results.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }

  return {
    segments: results,
    count: results.length,
    categories: Object.keys(byCategory),
    resource_filter: args.resource ?? null,
    source: getCacheMeta().source,
  }
}

export function handleGetRules() {
  return { rules: GAQL_RULES, count: GAQL_RULES.length }
}

export async function handleRefreshCache() {
  const schema = await refreshSchema()
  return {
    refreshed: true,
    meta: getCacheMeta(),
    counts: {
      resources: schema.resources.length,
      metrics: schema.metrics.length,
      segments: schema.segments.length,
    },
  }
}

export function handleGetCacheStatus() {
  return getCacheMeta()
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  resource?: string
  hasDateFilter: boolean
  hasLimit: boolean
  isSnapshotResource: boolean
  source: 'live' | 'static' | 'unloaded'
}

export async function handleValidateQuery(args: { query: string }): Promise<ValidationResult> {
  const schema = await getSchema()
  const query = args.query.trim()
  const errors: string[] = []
  const warnings: string[] = []

  const fromMatch = query.match(/\bFROM\s+([a-zA-Z_]+)/i)
  const resource = fromMatch?.[1]
  const snapshot = resource ? isSnapshotResource(resource) : false

  if (!resource) {
    errors.push('No FROM clause found')
  } else if (!schema.resources.find((r) => r.name === resource)) {
    warnings.push(`Resource "${resource}" not found in known schema (may still be valid)`)
  }

  if (/\bDURING\s+(LAST_|YESTERDAY|TODAY|THIS_)/i.test(query)) {
    errors.push("DURING clauses are not allowed. Use BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'.")
  }

  let hasDateFilter = false
  if (resource === 'change_event') {
    hasDateFilter = /change_event\.change_date_time/i.test(query)
    if (!hasDateFilter) {
      errors.push('change_event queries MUST filter on change_event.change_date_time')
    }
  } else if (!snapshot) {
    hasDateFilter = /segments\.date\s+BETWEEN\s+'[\d-]+'\s+AND\s+'[\d-]+'/i.test(query)
    if (!hasDateFilter) {
      errors.push('Missing required segments.date BETWEEN filter')
    }
  } else {
    hasDateFilter = true
  }

  if (/segments\.date\s*[<>]=?\s*'/i.test(query)) {
    errors.push('Comparison operators on segments.date are not allowed. Use BETWEEN.')
  }

  const hasLimit = /\bLIMIT\s+\d+/i.test(query)
  if (resource === 'change_event' && !hasLimit) {
    warnings.push('change_event queries should include a LIMIT clause (recommended 500)')
  }

  // Validate enum values used in WHERE clauses against the schema's known enum values
  const enumFieldRegex = /\b(segments\.[a-z_]+|[a-z_]+\.[a-z_]+)\s+(?:=|!=|IN|NOT IN)\s*\(?([^)]+?)\)?(?:\s+AND|\s+OR|\s*$|\s+ORDER|\s+LIMIT|\s+GROUP)/gi
  let enumMatch: RegExpExecArray | null
  while ((enumMatch = enumFieldRegex.exec(query)) !== null) {
    const fieldName = enumMatch[1]
    const valuesRaw = enumMatch[2]
    const segment = schema.segments.find((s) => s.name === fieldName)
    if (segment?.values && segment.values.length > 0) {
      const usedValues = Array.from(valuesRaw.matchAll(/'([^']+)'/g)).map((m) => m[1])
      const invalidValues = usedValues.filter((v) => !segment.values!.includes(v))
      if (invalidValues.length > 0) {
        errors.push(
          `Invalid enum value(s) for ${fieldName}: ${invalidValues.map((v) => `'${v}'`).join(', ')}. Valid values: ${segment.values.join(', ')}`,
        )
      }
    }
  }

  if (
    resource &&
    !snapshot &&
    /\bcampaign\b/i.test(query) &&
    !/campaign\.status\s*=\s*'ENABLED'/i.test(query)
  ) {
    warnings.push("Consider adding campaign.status = 'ENABLED' to filter active campaigns")
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resource,
    hasDateFilter,
    hasLimit,
    isSnapshotResource: snapshot,
    source: getCacheMeta().source,
  }
}

export async function handleGetSchemaForPrompt(args: { resource?: string }) {
  const schema = await getSchema()
  const lines: string[] = []
  lines.push('# Google Ads GAQL Schema Reference')
  lines.push(`_Source: ${getCacheMeta().source} | API: ${schema.apiVersion} | Fetched: ${schema.fetchedAt}_`)
  lines.push('')

  // Filter metrics by resource if specified
  const metricsToUse = args.resource
    ? schema.metrics.filter((m) => m.compatibleResources?.includes(args.resource!))
    : schema.metrics

  // Filter segments by resource if specified
  const segmentsToUse = args.resource
    ? schema.segments.filter((s) => s.compatibleResources?.includes(args.resource!))
    : schema.segments

  lines.push('## Resources (Tables)')
  for (const r of schema.resources) {
    const dateNote = r.supportsSegmentsDate ? '' : ' [SNAPSHOT - no segments.date]'
    lines.push(`- **${r.name}**${dateNote}: ${r.description}`)
    if (r.requiredFields.length) {
      lines.push(`  - Required: ${r.requiredFields.join(', ')}`)
    }
    const preview = r.fields.slice(0, 12)
    if (preview.length) {
      lines.push(`  - Fields: ${preview.join(', ')}${r.fields.length > 12 ? ', ...' : ''}`)
    }
    if (r.notes) lines.push(`  - Note: ${r.notes}`)
  }

  lines.push('')
  lines.push('## Metrics')
  const metricsByCat = groupBy(metricsToUse)
  for (const cat of Object.keys(metricsByCat).sort()) {
    lines.push(`### ${cat}`)
    for (const m of metricsByCat[cat]) {
      lines.push(`- ${m.name}: ${m.description}${m.unit ? ` (${m.unit})` : ''}`)
    }
  }

  lines.push('')
  lines.push('## Segments')
  const segByCat = groupBy(segmentsToUse)
  for (const cat of Object.keys(segByCat).sort()) {
    lines.push(`### ${cat}`)
    for (const s of segByCat[cat]) {
      const vals = s.values ? ` Values: ${s.values.join(', ')}` : ''
      lines.push(`- ${s.name}: ${s.description}.${vals}`)
    }
  }

  lines.push('')
  lines.push('## Critical Rules')
  for (const rule of GAQL_RULES) {
    lines.push(`- [${rule.severity.toUpperCase()}] ${rule.description}`)
  }

  return {
    prompt: lines.join('\n'),
    source: getCacheMeta().source,
    resource_filter: args.resource ?? null,
    metric_count: metricsToUse.length,
    segment_count: segmentsToUse.length,
  }
}
