/**
 * GA4 Tool Types
 */

export interface GA4ToolInput {
  query: string
  propertyId: string
  credentials?: any
}

export interface GA4ToolOutput {
  success: boolean
  response: string
  data: any[]
  summary: {
    totalRows: number
    dateRange: string
    propertyId: string
  }
  query: any
  error?: string
}

export interface GA4ComparisonOutput {
  success: boolean
  response: string
  data: {
    main: any[]
    comparison: any[]
  }
  summary: {
    main: {
      totalRows: number
      dateRange: string
      propertyId: string
    }
    comparison: {
      totalRows: number
      dateRange: string
      propertyId: string
    }
  }
  query: any
  error?: string
}
