/**
 * Result processing for Bing Ads V1 API
 */

import { createLogger } from '@sim/logger'
import { MICROS_PER_DOLLAR } from './constants'
import type { ProcessedResults } from './types'

const logger = createLogger('BingAdsV1ResultProcessing')

/**
 * Processes Bing Ads API results
 * 
 * @param apiResult - Raw API response from Bing Ads
 * @param requestId - Request ID for logging
 * @returns Processed results with formatted data
 */
export function processResults(apiResult: any, requestId: string): ProcessedResults {
  try {
    logger.info(`[${requestId}] Processing Bing Ads results`, {
      hasData: !!apiResult.data,
      hasRows: !!apiResult.rows,
      hasCampaigns: !!apiResult.campaigns
    })

    // If API returned campaigns (old Bing Ads API format), use them
    if (apiResult.campaigns && Array.isArray(apiResult.campaigns)) {
      const processedRows = apiResult.campaigns.map((row: Record<string, any>) => formatRow(row))
      
      return {
        rows: processedRows,
        row_count: processedRows.length,
        total_rows: processedRows.length,
        totals: calculateTotals(processedRows)
      }
    }

    // If API returned rows directly, use them
    if (apiResult.rows && Array.isArray(apiResult.rows)) {
      const processedRows = apiResult.rows.map((row: Record<string, any>) => formatRow(row))
      
      return {
        rows: processedRows,
        row_count: processedRows.length,
        total_rows: processedRows.length,
        totals: calculateTotals(processedRows)
      }
    }

    // If API returned data structure, extract rows
    if (apiResult.data) {
      // Handle different response formats
      let rows = []
      
      if (apiResult.data.rows) {
        rows = apiResult.data.rows
      } else if (Array.isArray(apiResult.data)) {
        rows = apiResult.data
      }

      const processedRows = rows.map((row: Record<string, any>) => formatRow(row))
      
      return {
        rows: processedRows,
        row_count: processedRows.length,
        total_rows: processedRows.length,
        totals: calculateTotals(processedRows)
      }
    }

    // No data found
    logger.warn(`[${requestId}] No data found in Bing Ads response`)
    
    return {
      rows: [],
      row_count: 0,
      total_rows: 0
    }

  } catch (error) {
    logger.error(`[${requestId}] Failed to process Bing Ads results`, { error })
    
    return {
      rows: [],
      row_count: 0,
      total_rows: 0
    }
  }
}

/**
 * Formats a single row of data
 * 
 * @param row - Raw row data
 * @returns Formatted row data
 */
function formatRow(row: Record<string, any>): any {
  // Bing Ads already returns data in correct format (dollars, percentages)
  // No conversion needed - return data as-is
  return row
}

/**
 * Calculates totals for numeric columns
 * CTR, avg_cpc, and cost_per_conversion are calculated, not summed
 * 
 * @param rows - Array of formatted rows
 * @returns Totals object with summed/calculated values
 */
function calculateTotals(rows: Record<string, any>[]): Record<string, number> {
  if (!rows.length) return {}

  const totals: Record<string, number> = {}
  
  // Columns that should be summed
  const sumColumns = ['impressions', 'clicks', 'spend', 'conversions']
  
  // Sum the appropriate columns
  for (const column of sumColumns) {
    let sum = 0
    for (const row of rows) {
      if (typeof row[column] === 'number') {
        sum += row[column]
      }
    }
    totals[column] = sum
  }
  
  // Calculate derived metrics
  const totalClicks = totals.clicks || 0
  const totalImpressions = totals.impressions || 0
  const totalSpend = totals.spend || 0
  const totalConversions = totals.conversions || 0
  
  // CTR = (total clicks / total impressions) * 100
  if (totalImpressions > 0) {
    totals.ctr = (totalClicks / totalImpressions) * 100
  }
  
  // Avg CPC = total spend / total clicks
  if (totalClicks > 0) {
    totals.avg_cpc = totalSpend / totalClicks
  }
  
  // Cost per conversion = total spend / total conversions
  if (totalConversions > 0) {
    totals.cost_per_conversion = totalSpend / totalConversions
  }

  return totals
}
