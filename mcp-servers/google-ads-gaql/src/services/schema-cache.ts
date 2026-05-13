/**
 * In-memory schema cache with TTL.
 *
 * Strategy:
 * 1. On first read, attempt to fetch live schema from Google Ads API.
 * 2. Cache result for TTL (default 1 hour).
 * 3. On API failure, fall back to bundled static schema so the MCP server
 *    keeps working even if Google Ads is unreachable.
 */

import { GAQL_RESOURCES } from '../schema/resources.js'
import { GAQL_METRICS } from '../schema/metrics.js'
import { GAQL_SEGMENTS } from '../schema/segments.js'
import { fetchLiveSchema, type LiveSchema } from './google-ads-field-service.js'

const TTL_MS = Number(process.env.SCHEMA_CACHE_TTL_MS ?? 60 * 60 * 1000) // 1h
const USE_LIVE_SCHEMA = process.env.USE_LIVE_SCHEMA !== 'false' // default on

interface CacheEntry {
  schema: LiveSchema
  source: 'live' | 'static'
  expiresAt: number
}

let entry: CacheEntry | null = null
let inflight: Promise<CacheEntry> | null = null

function staticSchema(): LiveSchema {
  return {
    resources: GAQL_RESOURCES,
    metrics: GAQL_METRICS,
    segments: GAQL_SEGMENTS,
    fetchedAt: new Date(0).toISOString(),
    apiVersion: 'static',
    fieldCount: GAQL_RESOURCES.length + GAQL_METRICS.length + GAQL_SEGMENTS.length,
  }
}

async function loadFresh(): Promise<CacheEntry> {
  if (!USE_LIVE_SCHEMA) {
    return { schema: staticSchema(), source: 'static', expiresAt: Date.now() + TTL_MS }
  }

  try {
    const schema = await fetchLiveSchema()
    console.log(
      `[schema-cache] Loaded live schema: ${schema.resources.length} resources, ` +
        `${schema.metrics.length} metrics, ${schema.segments.length} segments ` +
        `(api ${schema.apiVersion}, ${schema.fieldCount} total fields)`,
    )
    return { schema, source: 'live', expiresAt: Date.now() + TTL_MS }
  } catch (err) {
    console.warn(
      `[schema-cache] Live schema fetch failed, falling back to static. Reason:`,
      (err as Error).message,
    )
    // Short TTL on fallback so we retry sooner
    return { schema: staticSchema(), source: 'static', expiresAt: Date.now() + 60_000 }
  }
}

export async function getSchema(): Promise<LiveSchema> {
  if (entry && entry.expiresAt > Date.now()) return entry.schema
  if (!inflight) {
    inflight = loadFresh().finally(() => {
      inflight = null
    })
  }
  entry = await inflight
  return entry.schema
}

export function getCacheMeta(): {
  source: 'live' | 'static' | 'unloaded'
  fetchedAt: string | null
  expiresAt: number | null
  apiVersion: string | null
  counts: { resources: number; metrics: number; segments: number } | null
} {
  if (!entry) return { source: 'unloaded', fetchedAt: null, expiresAt: null, apiVersion: null, counts: null }
  return {
    source: entry.source,
    fetchedAt: entry.schema.fetchedAt,
    expiresAt: entry.expiresAt,
    apiVersion: entry.schema.apiVersion,
    counts: {
      resources: entry.schema.resources.length,
      metrics: entry.schema.metrics.length,
      segments: entry.schema.segments.length,
    },
  }
}

/** Force a refresh (e.g., on cache_refresh tool call). */
export async function refreshSchema(): Promise<LiveSchema> {
  entry = null
  inflight = null
  return getSchema()
}

/** Prewarm on startup. Errors are swallowed (static fallback already handled). */
export async function prewarmSchema(): Promise<void> {
  try {
    await getSchema()
  } catch {
    /* noop */
  }
}
