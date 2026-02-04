/**
 * Google Search Console Result Processing
 * Processes GSC API responses and calculates totals
 */

import { GSCResponse, GSCQueryResult, GSCRow } from '../types'

export function processResults(apiResult: GSCResponse, requestId: string): GSCQueryResult {
  const rows = apiResult.rows || []
  
  // Calculate totals
  const totals = calculateTotals(rows)
  
  return {
    site: '',
    query: '',
    startDate: '',
    endDate: '',
    dimensions: [],
    type: 'web',
    aggregationType: apiResult.responseAggregationType || 'auto',
    data: rows,
    row_count: rows.length,
    totals
  }
}

function calculateTotals(rows: GSCRow[]): {
  clicks: number
  impressions: number
  avg_ctr: number
  avg_position: number
} {
  if (!rows.length) {
    return {
      clicks: 0,
      impressions: 0,
      avg_ctr: 0,
      avg_position: 0
    }
  }

  let totalClicks = 0
  let totalImpressions = 0
  let totalPosition = 0
  let totalCtr = 0

  for (const row of rows) {
    totalClicks += row.clicks
    totalImpressions += row.impressions
    totalPosition += row.position
    totalCtr += row.ctr
  }

  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgPosition = rows.length > 0 ? totalPosition / rows.length : 0

  return {
    clicks: totalClicks,
    impressions: totalImpressions,
    avg_ctr: avgCtr,
    avg_position: avgPosition
  }
}

export function formatRow(row: GSCRow): any {
  return {
    keys: row.keys,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position
  }
}
