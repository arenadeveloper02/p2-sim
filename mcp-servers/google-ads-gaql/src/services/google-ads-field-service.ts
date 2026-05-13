/**
 * GoogleAdsFieldService client
 *
 * Fetches the live GAQL schema (resources, fields, metrics, segments) from
 * Google Ads' `googleAdsFields:search` REST endpoint, then transforms the
 * flat response into the same shape our static schema files use so the rest
 * of the MCP server doesn't need to change.
 *
 * Auth: OAuth2 refresh-token flow (same env vars as apps/sim).
 */

import type { GaqlMetric, GaqlResource, GaqlSegment } from '../schema/types.js'

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? 'v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FIELDS_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/googleAdsFields:search`

/** Raw row returned by googleAdsFields:search */
interface GoogleAdsFieldRow {
  name: string
  category: 'UNSPECIFIED' | 'UNKNOWN' | 'RESOURCE' | 'ATTRIBUTE' | 'SEGMENT' | 'METRIC'
  selectable?: boolean
  filterable?: boolean
  sortable?: boolean
  selectableWith?: string[]
  attributeResources?: string[]
  metrics?: string[]
  segments?: string[]
  isRepeated?: boolean
  typeUrl?: string
  dataType?: string
  enumValues?: string[]
}

export interface LiveSchema {
  resources: GaqlResource[]
  metrics: GaqlMetric[]
  segments: GaqlSegment[]
  fetchedAt: string
  apiVersion: string
  fieldCount: number
}

export class GoogleAdsFieldServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'GoogleAdsFieldServiceError'
  }
}

function readCreds() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!developerToken || !clientId || !clientSecret || !refreshToken) {
    throw new GoogleAdsFieldServiceError(
      'Missing Google Ads credentials. Required: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN',
    )
  }
  return { developerToken, clientId, clientSecret, refreshToken, loginCustomerId }
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = readCreds()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new GoogleAdsFieldServiceError(`Token refresh failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new GoogleAdsFieldServiceError('Token response missing access_token')
  }
  return data.access_token
}

async function fetchAllFields(): Promise<GoogleAdsFieldRow[]> {
  const { developerToken, loginCustomerId } = readCreds()
  const accessToken = await getAccessToken()

  const query = `
    SELECT
      name,
      category,
      selectable,
      filterable,
      sortable,
      selectable_with,
      attribute_resources,
      metrics,
      segments,
      is_repeated,
      type_url,
      data_type,
      enum_values
  `.replace(/\s+/g, ' ').trim()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId
  }

  const rows: GoogleAdsFieldRow[] = []
  let pageToken: string | undefined

  do {
    const body: Record<string, unknown> = { query, pageSize: 10000 }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch(FIELDS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new GoogleAdsFieldServiceError(
        `googleAdsFields:search failed: ${res.status} ${text}`,
      )
    }
    const data = (await res.json()) as {
      results?: GoogleAdsFieldRow[]
      nextPageToken?: string
    }
    if (data.results?.length) rows.push(...data.results)
    pageToken = data.nextPageToken
  } while (pageToken)

  return rows
}

const SNAPSHOT_RESOURCES = new Set([
  'asset',
  'campaign_asset',
  'asset_group_asset',
  'campaign_criterion',
  'change_event',
  'change_status',
  'audience',
  'conversion_action',
  'label',
  'recommendation',
  'campaign_budget',
])

function inferCategory(resourceName: string): string {
  if (resourceName.startsWith('campaign')) return 'campaign'
  if (resourceName.startsWith('ad_group')) return 'ad_group'
  if (resourceName.includes('keyword')) return 'keyword'
  if (resourceName.includes('search_term')) return 'search_term'
  if (resourceName.includes('geographic') || resourceName.includes('location')) return 'geographic'
  if (resourceName === 'gender_view' || resourceName === 'age_range_view' || resourceName === 'parental_status_view') return 'demographic'
  if (resourceName.includes('asset')) return 'asset'
  if (resourceName.includes('shopping') || resourceName.includes('product_group')) return 'shopping'
  if (resourceName.includes('change_')) return 'change_history'
  if (resourceName === 'conversion_action') return 'conversion'
  if (resourceName === 'customer') return 'account'
  if (resourceName.includes('ad_')) return 'ad'
  return 'other'
}

function inferMetricCategory(name: string): string {
  if (name.includes('cost') || name.includes('cpc') || name.includes('cpm') || name.includes('cpv') || name.includes('cpe')) return 'rate'
  if (name.includes('impression_share') || name.includes('top_impression')) return 'impression_share'
  if (name.includes('video')) return 'video'
  if (name.includes('quality')) return 'quality'
  if (name.includes('phone')) return 'call'
  if (name.includes('active_view')) return 'active_view'
  if (name.includes('attribut') || name.includes('cross_device')) return 'attribution'
  if (name.includes('rate') || name.includes('ctr')) return 'rate'
  return 'core'
}

function inferSegmentCategory(name: string): string {
  const tail = name.replace(/^segments\./, '')
  if (['date', 'day_of_week', 'week', 'month', 'month_of_year', 'quarter', 'year', 'hour'].includes(tail)) return 'date'
  if (tail === 'device') return 'device'
  if (tail.includes('ad_network') || tail.includes('click_type')) return 'network'
  if (tail.startsWith('geo_')) return 'geographic'
  if (tail.startsWith('conversion_')) return 'conversion'
  if (tail.startsWith('product_')) return 'product'
  if (tail.startsWith('search_term') || tail.startsWith('keyword')) return 'search'
  if (tail.startsWith('asset_')) return 'asset'
  if (tail.startsWith('hotel_')) return 'hotel'
  return 'other'
}

/**
 * Transforms flat GoogleAdsField rows into our structured schema shape.
 */
export function buildSchemaFromFields(rows: GoogleAdsFieldRow[]): LiveSchema {
  const resourceRows = rows.filter((r) => r.category === 'RESOURCE')
  const attributeRows = rows.filter((r) => r.category === 'ATTRIBUTE')
  const metricRows = rows.filter((r) => r.category === 'METRIC')
  const segmentRows = rows.filter((r) => r.category === 'SEGMENT')

  // Group attributes by owning resource (first dot-prefix)
  const fieldsByResource = new Map<string, string[]>()
  for (const a of attributeRows) {
    const owner = a.name.split('.')[0]
    if (!owner) continue
    if (!fieldsByResource.has(owner)) fieldsByResource.set(owner, [])
    fieldsByResource.get(owner)!.push(a.name)
  }

  const resources: GaqlResource[] = resourceRows.map((r) => {
    const fields = (fieldsByResource.get(r.name) ?? []).sort()
    const supportsSegmentsDate = (r.segments ?? []).includes('segments.date')
    const supportsMetrics = (r.metrics?.length ?? 0) > 0
    return {
      name: r.name,
      category: inferCategory(r.name),
      description: `${r.name} resource`,
      fields,
      requiredFields: [],
      supportsSegmentsDate,
      supportsMetrics,
      notes: SNAPSHOT_RESOURCES.has(r.name) ? 'Snapshot resource - limited segments.date support' : undefined,
    }
  })

  // Build reverse map: metric name → which resources support it
  const metricToResources = new Map<string, string[]>()
  for (const r of resourceRows) {
    if (!r.metrics?.length) continue
    for (const metricName of r.metrics) {
      if (!metricToResources.has(metricName)) metricToResources.set(metricName, [])
      metricToResources.get(metricName)!.push(r.name)
    }
  }

  // Build reverse map: segment name → which resources support it
  const segmentToResources = new Map<string, string[]>()
  for (const r of resourceRows) {
    if (!r.segments?.length) continue
    for (const segmentName of r.segments) {
      if (!segmentToResources.has(segmentName)) segmentToResources.set(segmentName, [])
      segmentToResources.get(segmentName)!.push(r.name)
    }
  }

  const metrics: GaqlMetric[] = metricRows.map((m) => {
    const inMicros = m.name.includes('_micros') || m.name.includes('cpc') || m.name.includes('cpm') || m.name.includes('cpv') || m.name.includes('cpe') || m.name.includes('cost_per')
    const isRate = m.dataType === 'DOUBLE' && (m.name.includes('rate') || m.name.includes('ctr') || m.name.includes('share') || m.name.includes('percentage'))
    return {
      name: m.name,
      category: inferMetricCategory(m.name),
      description: `${m.name}${m.dataType ? ` (${m.dataType})` : ''}`,
      unit: inMicros ? 'micros' : isRate ? 'percent' : undefined,
      compatibleResources: metricToResources.get(m.name),
    }
  })

  const segments: GaqlSegment[] = segmentRows.map((s) => ({
    name: s.name,
    category: inferSegmentCategory(s.name),
    description: `${s.name}${s.dataType ? ` (${s.dataType})` : ''}`,
    values: s.enumValues && s.enumValues.length ? s.enumValues : undefined,
    compatibleResources: segmentToResources.get(s.name),
  }))

  return {
    resources,
    metrics,
    segments,
    fetchedAt: new Date().toISOString(),
    apiVersion: GOOGLE_ADS_API_VERSION,
    fieldCount: rows.length,
  }
}

/**
 * Fetch + transform live schema from Google Ads API.
 */
export async function fetchLiveSchema(): Promise<LiveSchema> {
  const rows = await fetchAllFields()
  return buildSchemaFromFields(rows)
}
