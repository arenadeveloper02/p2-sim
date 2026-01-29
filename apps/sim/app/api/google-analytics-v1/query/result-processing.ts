import type { Logger } from '@sim/logger'
import type { ProcessedResults } from './types'

export function processResults(apiResult: any, requestId: string, logger: Logger): ProcessedResults {
  try {
    logger.info(`[${requestId}] Processing GA4 results`, {
      hasRows: !!apiResult.rows,
      hasDimensionHeaders: !!apiResult.dimensionHeaders,
      hasMetricHeaders: !!apiResult.metricHeaders
    })

    if (!apiResult.rows || apiResult.rows.length === 0) {
      logger.warn(`[${requestId}] No data found in GA4 response`)
      return {
        rows: [],
        row_count: 0,
        total_rows: 0
      }
    }

    // Process dimension and metric headers
    const dimensionHeaders = apiResult.dimensionHeaders || []
    const metricHeaders = apiResult.metricHeaders || []
    
    // Combine headers for column names
    const headers = [
      ...dimensionHeaders.map((h: any) => h.name),
      ...metricHeaders.map((h: any) => h.name)
    ]

    // Process rows
    const processedRows = apiResult.rows.map((row: any) => {
      const processedRow: Record<string, any> = {}
      
      // Process dimensions
      if (row.dimensionValues) {
        row.dimensionValues.forEach((value: any, index: number) => {
          const headerName = dimensionHeaders[index]?.name || `dimension_${index}`
          processedRow[headerName] = value.value
        })
      }
      
      // Process metrics
      if (row.metricValues) {
        row.metricValues.forEach((value: any, index: number) => {
          const headerName = metricHeaders[index]?.name || `metric_${index}`
          // Convert metric values based on type
          if (value.value) {
            processedRow[headerName] = parseFloat(value.value) || value.value
          }
        })
      }
      
      return processedRow
    })

    // Calculate totals for numeric columns
    const totals = calculateTotals(processedRows, headers)

    logger.info(`[${requestId}] GA4 results processed successfully`, {
      row_count: processedRows.length,
      total_rows: processedRows.length,
      columns: headers.length
    })

    return {
      rows: processedRows,
      row_count: processedRows.length,
      total_rows: processedRows.length,
      totals
    }

  } catch (error) {
    logger.error(`[${requestId}] Failed to process GA4 results`, { error })
    return {
      rows: [],
      row_count: 0,
      total_rows: 0
    }
  }
}

function calculateTotals(rows: any[], headers: string[]): Record<string, number> {
  const totals: Record<string, number> = {}
  
  headers.forEach(header => {
    const values = rows
      .map(row => row[header])
      .filter(value => typeof value === 'number' && !isNaN(value))
    
    if (values.length > 0) {
      totals[header] = values.reduce((sum, value) => sum + value, 0)
    }
  })
  
  return totals
}
