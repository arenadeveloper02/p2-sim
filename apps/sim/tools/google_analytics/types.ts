export interface GoogleAnalyticsV1Response {
  success: boolean
  data: {
    rows: any[]
    row_count: number
    total_rows: number
    totals?: Record<string, number>
  }
  query: string
  metadata: {
    requestId: string
    property: string
    dimensions: string[]
    metrics: string[]
    dateRanges: Array<{
      startDate: string
      endDate: string
    }>
  }
  error?: string
}
