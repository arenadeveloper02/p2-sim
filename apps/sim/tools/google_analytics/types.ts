/**
 * Google Analytics Tool Types
 */

export interface GoogleAnalyticsResponse {
  success: boolean
  data?: any[]
  row_count?: number
  totals?: Record<string, number>
  property?: {
    id: string
    name: string
    displayName: string
  }
  dimensions?: string[]
  metrics?: string[]
  dateRanges?: Array<{
    startDate: string
    endDate: string
  }>
  execution_time_ms?: number
  error?: string
}
