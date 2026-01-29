/**
 * Result processing for Google Analytics v1 API
 */

import type { Logger } from '@sim/logger'
import type { ProcessedResults } from './types'

/**
 * Processes Google Analytics API results
 * 
 * @param apiResult - Raw API response from Google Analytics
 * @param requestId - Request ID for logging
 * @param logger - Logger instance
 * @returns Processed results with formatted data
 */
export function processResults(apiResult: any, requestId: string, logger: Logger): ProcessedResults {
  try {
    logger.info(`[${requestId}] Processing Google Analytics results`, {
      hasData: !!apiResult.data,
      hasRows: !!apiResult.rows,
      hasReports: !!apiResult.reports
    })

    // If API returned reports (GA4 Data API format)
    if (apiResult.reports && Array.isArray(apiResult.reports)) {
      const report = apiResult.reports[0] // Use first report
      if (report.rows) {
        const processedRows = report.rows.map((row: any) => formatGA4Row(row))
        
        return {
          rows: processedRows,
          row_count: processedRows.length,
          total_rows: processedRows.length,
          totals: calculateTotals(processedRows)
        }
      }
    }

    // If API returned rows directly
    if (apiResult.rows && Array.isArray(apiResult.rows)) {
      const processedRows = apiResult.rows.map((row: any) => formatGA4Row(row))
      
      return {
        rows: processedRows,
        row_count: processedRows.length,
        total_rows: processedRows.length,
        totals: calculateTotals(processedRows)
      }
    }

    // If API returned data structure
    if (apiResult.data) {
      let rows = []
      
      if (apiResult.data.rows) {
        rows = apiResult.data.rows
      } else if (apiResult.data.reports && apiResult.data.reports[0]?.rows) {
        rows = apiResult.data.reports[0].rows
      } else if (Array.isArray(apiResult.data)) {
        rows = apiResult.data
      }

      const processedRows = rows.map((row: any) => formatGA4Row(row))
      
      return {
        rows: processedRows,
        row_count: processedRows.length,
        total_rows: processedRows.length,
        totals: calculateTotals(processedRows)
      }
    }

    // No data found
    logger.warn(`[${requestId}] No data found in Google Analytics response`)
    
    return {
      rows: [],
      row_count: 0,
      total_rows: 0
    }

  } catch (error) {
    logger.error(`[${requestId}] Failed to process Google Analytics results`, { error })
    
    return {
      rows: [],
      row_count: 0,
      total_rows: 0
    }
  }
}

/**
 * Formats a single GA4 row of data
 * 
 * @param row - Raw row data from GA4 API
 * @returns Formatted row data
 */
function formatGA4Row(row: any): any {
  const formatted: any = {}

  // Process dimension values
  if (row.dimensionValues) {
    row.dimensionValues.forEach((dimension: any, index: number) => {
      // GA4 API returns dimensions as array, we need to map them
      // This will be enhanced based on the actual GA4 API response structure
      formatted[`dimension_${index}`] = dimension.value
    })
  }

  // Process metric values
  if (row.metricValues) {
    row.metricValues.forEach((metric: any, index: number) => {
      // GA4 API returns metrics as array, we need to map them
      // This will be enhanced based on the actual GA4 API response structure
      formatted[`metric_${index}`] = metric.value
    })
  }

  // If row has direct properties (simplified structure)
  if (typeof row === 'object' && !row.dimensionValues && !row.metricValues) {
    return row // Return as-is for simple structures
  }

  return formatted
}

/**
 * Calculates totals for numeric columns
 * 
 * @param rows - Array of formatted rows
 * @returns Totals object with summed/calculated values
 */
function calculateTotals(rows: Record<string, any>[]): Record<string, number> {
  if (!rows.length) return {}

  const totals: Record<string, number> = {}
  
  // Find all numeric columns (metrics)
  const numericColumns = new Set<string>()
  
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key.startsWith('metric_') && typeof row[key] === 'number') {
        numericColumns.add(key)
      }
    })
  })

  // Sum the numeric columns
  for (const column of Array.from(numericColumns)) {
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
