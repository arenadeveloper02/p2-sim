/**
 * Result processing for Bing Ads V1 API
 */

import { createLogger } from '@/lib/logs/console/logger'
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
      hasRows: !!apiResult.rows
    })

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
  const formatted: any = {}

  // Convert micros to dollars for spend/cost fields
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().includes('spend') || key.toLowerCase().includes('cost')) {
      formatted[key] = typeof value === 'number' ? value / MICROS_PER_DOLLAR : value
    } else if (key.toLowerCase().includes('ctr')) {
      // Convert CTR from decimal to percentage
      formatted[key] = typeof value === 'number' ? value * 100 : value
    } else {
      formatted[key] = value
    }
  }

  return formatted
}

/**
 * Calculates totals for numeric columns
 * 
 * @param rows - Array of formatted rows
 * @returns Totals object with summed values
 */
function calculateTotals(rows: Record<string, any>[]): Record<string, number> {
  if (!rows.length) return {}

  const totals: Record<string, number> = {}
  const numericColumns = new Set<string>()

  // Find numeric columns from first row
  for (const [key, value] of Object.entries(rows[0])) {
    if (typeof value === 'number') {
      numericColumns.add(key)
    }
  }

  // Sum each numeric column
  for (const column of numericColumns) {
    let sum = 0
    for (const row of rows) {
      if (typeof row[column] === 'number') {
        sum += row[column]
      }
    }
    totals[column] = sum
  }

  return totals
}
