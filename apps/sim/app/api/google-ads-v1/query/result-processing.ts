/**
 * Result processing for Google Ads V1
 * Formats and processes GAQL query results
 */

import type { Logger } from '@sim/logger'
import { MICROS_PER_DOLLAR } from './constants'
import type { ProcessedResults } from './types'

/**
 * Formats a single result row, preserving nested structure and converting string numbers
 * 
 * This function:
 * - Preserves nested object structure (campaign, adGroup, metrics, etc.)
 * - Converts string representations of numbers to actual numbers
 * - Keeps IDs as strings
 * - Adds dollar conversion for micros fields
 * 
 * @param row - Raw result row from Google Ads API
 * @returns Formatted row with proper types
 */
function formatResultRow(row: any): any {
  if (row === null || row === undefined) return row
  
  if (Array.isArray(row)) {
    return row.map(item => formatResultRow(item))
  }
  
  if (typeof row === 'object') {
    const formatted: any = {}
    
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        formatted[key] = value
        continue
      }
      
      // Handle nested objects recursively (campaign, adGroup, metrics, etc.)
      if (typeof value === 'object' && !Array.isArray(value)) {
        formatted[key] = formatResultRow(value)
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        formatted[key] = value.map(item => formatResultRow(item))
      }
      // Convert string numbers to actual numbers for metrics
      else if (typeof value === 'string' && !Number.isNaN(Number(value)) && value !== '') {
        // Keep as string for IDs, convert to number for metrics
        if (key === 'id' || key.endsWith('Id') || key === 'resourceName') {
          formatted[key] = value
        } else {
          formatted[key] = Number.parseFloat(value)
        }
      }
      // Keep other values as-is
      else {
        formatted[key] = value
      }
    }
    
    // Add dollar conversion for micros fields (only at metrics level)
    if (formatted.costMicros !== undefined) {
      formatted.cost_dollars = Math.round((formatted.costMicros / MICROS_PER_DOLLAR) * 100) / 100
    }
    if (formatted.averageCpc !== undefined) {
      formatted.average_cpc_dollars = Math.round((formatted.averageCpc / MICROS_PER_DOLLAR) * 100) / 100
    }
    if (formatted.costPerConversion !== undefined) {
      formatted.cost_per_conversion_dollars = Math.round((formatted.costPerConversion / MICROS_PER_DOLLAR) * 100) / 100
    }
    
    return formatted
  }
  
  return row
}

/**
 * Calculates totals for common metrics across all rows
 * 
 * @param rows - Processed result rows
 * @returns Object containing aggregated totals
 */
function calculateTotals(rows: any[]): Record<string, number> | undefined {
  if (rows.length === 0) return undefined
  
  const firstRow = rows[0]
  
  // Check if metrics exist
  if (!firstRow.metrics) return undefined
  
  const totals: Record<string, number> = {}
  const sumFields = ['clicks', 'impressions', 'conversions', 'conversionsValue']
  
  // Sum up basic metrics
  for (const field of sumFields) {
    if (firstRow.metrics[field] !== undefined) {
      totals[field] = rows.reduce((sum: number, row: any) => {
        const value = row.metrics?.[field]
        if (value === undefined || value === null) return sum
        return sum + (typeof value === 'number' ? value : Number.parseFloat(value))
      }, 0)
      
      // Round conversions value
      if (field === 'conversionsValue') {
        totals[field] = Math.round(totals[field] * 100) / 100
      }
    }
  }
  
  // Cost with micros conversion
  if (firstRow.metrics.costMicros !== undefined) {
    const totalCostMicros = rows.reduce((sum: number, row: any) => {
      const value = row.metrics?.costMicros
      if (value === undefined || value === null) return sum
      return sum + (typeof value === 'number' ? value : Number.parseFloat(value))
    }, 0)
    totals.costMicros = totalCostMicros
    totals.cost_dollars = Math.round((totalCostMicros / MICROS_PER_DOLLAR) * 100) / 100
  }
  
  // Average CPC with micros conversion
  if (firstRow.metrics.averageCpc !== undefined) {
    const totalClicks = totals.clicks || 0
    if (totalClicks > 0) {
      const avgCpcMicros = (totals.costMicros || 0) / totalClicks
      totals.averageCpc = Math.round(avgCpcMicros * 100) / 100
      totals.average_cpc_dollars = Math.round((avgCpcMicros / MICROS_PER_DOLLAR) * 100) / 100
    }
  }
  
  // CTR calculation
  if (firstRow.metrics.ctr !== undefined && totals.impressions && totals.clicks) {
    totals.ctr = (totals.clicks / totals.impressions) * 100
    totals.ctr = Math.round(totals.ctr * 100) / 100
  }
  
  return Object.keys(totals).length > 0 ? totals : undefined
}

/**
 * Processes Google Ads API results
 * 
 * This function:
 * - Formats all result rows
 * - Calculates aggregate totals
 * - Preserves all fields from the GAQL query
 * - Converts values to appropriate types
 * 
 * @param apiResult - Raw API result from Google Ads
 * @param requestId - Request ID for logging
 * @param logger - Logger instance
 * @returns Processed results with rows, counts, and totals
 */
export function processResults(
  apiResult: any,
  requestId: string,
  logger: Logger
): ProcessedResults {
  if (!apiResult.results || !Array.isArray(apiResult.results)) {
    logger.warn(`[${requestId}] No results found in API response`)
    return {
      rows: [],
      row_count: 0,
      total_rows: 0,
    }
  }

  logger.info(`[${requestId}] Processing ${apiResult.results.length} rows`)

  // Format all results, preserving nested structure and converting values
  const processedRows = apiResult.results.map((row: any) => formatResultRow(row))

  // Calculate totals
  const totals = calculateTotals(processedRows)

  return {
    rows: processedRows,
    row_count: processedRows.length,
    total_rows: apiResult.totalResultsCount || processedRows.length,
    totals,
  }
}
