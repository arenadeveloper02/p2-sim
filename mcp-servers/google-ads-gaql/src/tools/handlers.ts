/**
 * MCP tool handlers for GAQL schema discovery and validation
 */

import { GAQL_RESOURCES, RESOURCES_BY_CATEGORY, getResourceByName } from '../schema/resources.js'
import { GAQL_METRICS, METRICS_BY_CATEGORY } from '../schema/metrics.js'
import { GAQL_SEGMENTS, SEGMENTS_BY_CATEGORY } from '../schema/segments.js'
import { GAQL_RULES, isSnapshotResource } from '../schema/rules.js'

export function handleGetSchema() {
  return {
    resources: GAQL_RESOURCES,
    metrics: GAQL_METRICS,
    segments: GAQL_SEGMENTS,
    rules: GAQL_RULES,
    counts: {
      resources: GAQL_RESOURCES.length,
      metrics: GAQL_METRICS.length,
      segments: GAQL_SEGMENTS.length,
      rules: GAQL_RULES.length,
    },
  }
}

export function handleGetResources(args: { category?: string; search?: string }) {
  let results = GAQL_RESOURCES

  if (args.category) {
    results = RESOURCES_BY_CATEGORY[args.category] ?? []
  }

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
    categories: Object.keys(RESOURCES_BY_CATEGORY),
  }
}

export function handleGetResource(args: { name: string }) {
  const resource = getResourceByName(args.name)
  if (!resource) {
    return { error: `Resource not found: ${args.name}`, available: GAQL_RESOURCES.map((r) => r.name) }
  }
  return { resource }
}

export function handleGetMetrics(args: { category?: string; search?: string }) {
  let results = GAQL_METRICS

  if (args.category) {
    results = METRICS_BY_CATEGORY[args.category] ?? []
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
    categories: Object.keys(METRICS_BY_CATEGORY),
  }
}

export function handleGetSegments(args: { category?: string; search?: string }) {
  let results = GAQL_SEGMENTS

  if (args.category) {
    results = SEGMENTS_BY_CATEGORY[args.category] ?? []
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
    categories: Object.keys(SEGMENTS_BY_CATEGORY),
  }
}

export function handleGetRules() {
  return { rules: GAQL_RULES, count: GAQL_RULES.length }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  resource?: string
  hasDateFilter: boolean
  hasLimit: boolean
  isSnapshotResource: boolean
}

export function handleValidateQuery(args: { query: string }): ValidationResult {
  const query = args.query.trim()
  const errors: string[] = []
  const warnings: string[] = []

  // Extract resource from FROM clause
  const fromMatch = query.match(/\bFROM\s+([a-zA-Z_]+)/i)
  const resource = fromMatch?.[1]
  const snapshot = resource ? isSnapshotResource(resource) : false

  // Check resource exists
  if (!resource) {
    errors.push('No FROM clause found')
  } else if (!getResourceByName(resource)) {
    warnings.push(`Resource "${resource}" not found in known schema (may still be valid)`)
  }

  // Check for DURING (not allowed)
  if (/\bDURING\s+(LAST_|YESTERDAY|TODAY|THIS_)/i.test(query)) {
    errors.push('DURING clauses are not allowed. Use BETWEEN \'YYYY-MM-DD\' AND \'YYYY-MM-DD\'.')
  }

  // Check date filter
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
    hasDateFilter = true // snapshot resources don't need it
  }

  // Check for comparison operators on segments.date
  if (/segments\.date\s*[<>]=?\s*'/i.test(query)) {
    errors.push('Comparison operators on segments.date are not allowed. Use BETWEEN.')
  }

  // Check LIMIT for change_event
  const hasLimit = /\bLIMIT\s+\d+/i.test(query)
  if (resource === 'change_event' && !hasLimit) {
    warnings.push('change_event queries should include a LIMIT clause (recommended 500)')
  }

  // Check campaign.status filter
  if (
    resource &&
    !snapshot &&
    /\bcampaign\b/i.test(query) &&
    !/campaign\.status\s*=\s*'ENABLED'/i.test(query)
  ) {
    warnings.push('Consider adding campaign.status = \'ENABLED\' to filter active campaigns')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resource,
    hasDateFilter,
    hasLimit,
    isSnapshotResource: snapshot,
  }
}

export function handleGetSchemaForPrompt() {
  // Returns a compact human-readable schema reference suitable for injecting
  // into an LLM system prompt.
  const lines: string[] = []
  lines.push('# Google Ads GAQL Schema Reference')
  lines.push('')
  lines.push('## Resources (Tables)')
  for (const r of GAQL_RESOURCES) {
    const dateNote = r.supportsSegmentsDate ? '' : ' [SNAPSHOT - no segments.date]'
    lines.push(`- **${r.name}**${dateNote}: ${r.description}`)
    lines.push(`  - Required: ${r.requiredFields.join(', ')}`)
    lines.push(`  - Fields: ${r.fields.slice(0, 12).join(', ')}${r.fields.length > 12 ? ', ...' : ''}`)
    if (r.notes) lines.push(`  - Note: ${r.notes}`)
  }
  lines.push('')
  lines.push('## Metrics')
  const metricsByCat = METRICS_BY_CATEGORY
  for (const cat of Object.keys(metricsByCat)) {
    lines.push(`### ${cat}`)
    for (const m of metricsByCat[cat]) {
      lines.push(`- ${m.name}: ${m.description}${m.unit ? ` (${m.unit})` : ''}`)
    }
  }
  lines.push('')
  lines.push('## Segments')
  const segByCat = SEGMENTS_BY_CATEGORY
  for (const cat of Object.keys(segByCat)) {
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

  return { prompt: lines.join('\n') }
}
