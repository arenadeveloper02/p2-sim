import { createLogger } from '@/lib/logs/console/logger'
import type { ProcessedGA4Results } from './types'
import { formatMetricValue } from './result-processing'

const logger = createLogger('GA4ResponseBuilder')

/**
 * Builds a formatted response for the user
 */
export function buildResponse(
  results: ProcessedGA4Results,
  query: string,
  ga4Query: any
): string {
  logger.info('Building formatted response', {
    rowCount: results.data.length,
    propertyId: results.summary.propertyId,
  })

  let response = `# GA4 Analytics Report\n\n`

  // Summary section
  response += `## Summary\n`
  response += `- **Property ID**: ${results.summary.propertyId}\n`
  response += `- **Date Range**: ${results.summary.dateRange}\n`
  response += `- **Total Rows**: ${results.summary.totalRows}\n`

  if (results.metadata?.currencyCode) {
    response += `- **Currency**: ${results.metadata.currencyCode}\n`
  }
  if (results.metadata?.timeZone) {
    response += `- **Time Zone**: ${results.metadata.timeZone}\n`
  }

  response += `\n`

  // Data table
  if (results.data.length === 0) {
    response += `## No Data Found\n\n`
    response += `No data was returned for the specified query and date range.\n`
    return response
  }

  response += `## Data\n\n`

  // Build table
  const headers = Object.keys(results.data[0])
  const columnWidths = headers.map((header) => {
    const maxValueLength = Math.max(
      ...results.data.map((row) => String(row[header] || '').length)
    )
    return Math.max(header.length, maxValueLength, 10)
  })

  // Table header
  response += `| ${headers.map((h, i) => h.padEnd(columnWidths[i])).join(' | ')} |\n`
  response += `| ${columnWidths.map((w) => '-'.repeat(w)).join(' | ')} |\n`

  // Table rows (limit to 50 for readability)
  const displayRows = results.data.slice(0, 50)
  for (const row of displayRows) {
    const values = headers.map((header, i) => {
      const value = row[header]
      const formatted = formatCellValue(value, header)
      return formatted.padEnd(columnWidths[i])
    })
    response += `| ${values.join(' | ')} |\n`
  }

  if (results.data.length > 50) {
    response += `\n*Showing 50 of ${results.data.length} rows*\n`
  }

  response += `\n`

  // Query details (collapsed)
  response += `<details>\n`
  response += `<summary>Query Details</summary>\n\n`
  response += `\`\`\`json\n${JSON.stringify(ga4Query, null, 2)}\n\`\`\`\n`
  response += `</details>\n`

  return response
}

/**
 * Format cell value for display
 */
function formatCellValue(value: any, columnName: string): string {
  if (value === null || value === undefined) return 'N/A'

  // Check if it's a metric (numeric value)
  if (typeof value === 'number') {
    return formatMetricValue(value, columnName)
  }

  return String(value)
}

/**
 * Build comparison response for two date ranges
 */
export function buildComparisonResponse(
  mainResults: ProcessedGA4Results,
  comparisonResults: ProcessedGA4Results,
  query: string
): string {
  logger.info('Building comparison response')

  let response = `# GA4 Analytics Comparison Report\n\n`

  response += `## Summary\n`
  response += `- **Property ID**: ${mainResults.summary.propertyId}\n`
  response += `- **Main Period**: ${mainResults.summary.dateRange}\n`
  response += `- **Comparison Period**: ${comparisonResults.summary.dateRange}\n`
  response += `\n`

  // Calculate totals for key metrics
  if (mainResults.data.length > 0 && comparisonResults.data.length > 0) {
    response += `## Key Metrics Comparison\n\n`

    const mainTotals = calculateTotals(mainResults.data)
    const comparisonTotals = calculateTotals(comparisonResults.data)

    response += `| Metric | Main Period | Comparison Period | Change |\n`
    response += `|--------|-------------|-------------------|--------|\n`

    for (const metric of Object.keys(mainTotals)) {
      const mainValue = mainTotals[metric]
      const compValue = comparisonTotals[metric] || 0
      const change = compValue !== 0 ? (((mainValue - compValue) / compValue) * 100).toFixed(2) : 'N/A'
      const changeSymbol = change !== 'N/A' && parseFloat(change) > 0 ? '📈' : change !== 'N/A' && parseFloat(change) < 0 ? '📉' : ''

      response += `| ${metric} | ${formatMetricValue(mainValue, metric)} | ${formatMetricValue(compValue, metric)} | ${change !== 'N/A' ? change + '%' : 'N/A'} ${changeSymbol} |\n`
    }

    response += `\n`
  }

  return response
}

/**
 * Calculate totals for numeric columns
 */
function calculateTotals(data: any[]): Record<string, number> {
  const totals: Record<string, number> = {}

  if (data.length === 0) return totals

  const firstRow = data[0]
  for (const key of Object.keys(firstRow)) {
    if (typeof firstRow[key] === 'number') {
      totals[key] = data.reduce((sum, row) => sum + (row[key] || 0), 0)
    }
  }

  return totals
}
