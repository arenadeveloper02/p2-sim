import { createLogger } from '@/lib/logs/console/logger'
import type { GA4Response, ProcessedGA4Results } from './types'

const logger = createLogger('GA4ResultProcessing')

/**
 * Processes GA4 API results and converts them to structured format
 */
export function processGA4Results(
  response: GA4Response,
  propertyId: string,
  dateRange: string
): ProcessedGA4Results {
  const data: any[] = []

  if (!response.rows || response.rows.length === 0) {
    logger.info('No rows returned from GA4 API')
    return {
      data: [],
      summary: {
        totalRows: 0,
        dateRange,
        propertyId,
      },
      metadata: response.metadata,
    }
  }

  logger.info(`Processing ${response.rows.length} rows from GA4 API`)

  // Build column headers
  const dimensionHeaders = response.dimensionHeaders?.map((h) => h.name) || []
  const metricHeaders = response.metricHeaders?.map((h) => h.name) || []

  // Process each row
  for (const row of response.rows) {
    const rowData: any = {}

    // Add dimensions
    if (row.dimensionValues) {
      for (let i = 0; i < row.dimensionValues.length; i++) {
        const dimensionName = dimensionHeaders[i] || `dimension${i}`
        rowData[dimensionName] = row.dimensionValues[i].value
      }
    }

    // Add metrics
    if (row.metricValues) {
      for (let i = 0; i < row.metricValues.length; i++) {
        const metricName = metricHeaders[i] || `metric${i}`
        const metricValue = row.metricValues[i].value

        // Parse numeric values
        const metricHeader = response.metricHeaders?.[i]
        if (metricHeader?.type === 'TYPE_INTEGER') {
          rowData[metricName] = parseInt(metricValue, 10)
        } else if (
          metricHeader?.type === 'TYPE_FLOAT' ||
          metricHeader?.type === 'TYPE_CURRENCY'
        ) {
          rowData[metricName] = parseFloat(metricValue)
        } else {
          rowData[metricName] = metricValue
        }
      }
    }

    data.push(rowData)
  }

  logger.info(`Processed ${data.length} rows successfully`)

  return {
    data,
    summary: {
      totalRows: response.rowCount || data.length,
      dateRange,
      propertyId,
    },
    metadata: response.metadata,
  }
}

/**
 * Format metric values for display
 */
export function formatMetricValue(
  value: number | string,
  metricName: string,
  metricType?: string
): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value

  // Currency formatting
  if (metricType === 'TYPE_CURRENCY' || metricName.toLowerCase().includes('revenue')) {
    return `$${numValue.toFixed(2)}`
  }

  // Percentage formatting
  if (metricName.toLowerCase().includes('rate') || metricName.toLowerCase().includes('percent')) {
    return `${(numValue * 100).toFixed(2)}%`
  }

  // Duration formatting (seconds to readable format)
  if (
    metricName.toLowerCase().includes('duration') ||
    metricName.toLowerCase().includes('time')
  ) {
    const minutes = Math.floor(numValue / 60)
    const seconds = Math.floor(numValue % 60)
    return `${minutes}m ${seconds}s`
  }

  // Integer formatting
  if (metricType === 'TYPE_INTEGER') {
    return numValue.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  // Float formatting
  return numValue.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): string {
  if (previous === 0) return 'N/A'
  const change = ((current - previous) / previous) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}
