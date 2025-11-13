/**
 * GA4 API Types
 */

export interface DateRange {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
}

export interface GA4Dimension {
  name: string
}

export interface GA4Metric {
  name: string
}

export interface GA4OrderBy {
  dimension?: {
    dimensionName: string
    orderType?: 'ALPHANUMERIC' | 'CASE_INSENSITIVE_ALPHANUMERIC' | 'NUMERIC'
  }
  metric?: {
    metricName: string
  }
  desc?: boolean
}

export interface GA4FilterExpression {
  andGroup?: {
    expressions: GA4FilterExpression[]
  }
  orGroup?: {
    expressions: GA4FilterExpression[]
  }
  notExpression?: {
    expression: GA4FilterExpression
  }
  filter?: {
    fieldName: string
    stringFilter?: {
      matchType: 'EXACT' | 'BEGINS_WITH' | 'ENDS_WITH' | 'CONTAINS' | 'FULL_REGEXP' | 'PARTIAL_REGEXP'
      value: string
      caseSensitive?: boolean
    }
    inListFilter?: {
      values: string[]
      caseSensitive?: boolean
    }
    numericFilter?: {
      operation: 'EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL'
      value: {
        int64Value?: string
        doubleValue?: number
      }
    }
  }
}

export interface GA4Query {
  propertyId: string
  dateRanges: Array<{
    startDate: string
    endDate: string
  }>
  dimensions?: GA4Dimension[]
  metrics: GA4Metric[]
  dimensionFilter?: GA4FilterExpression
  metricFilter?: GA4FilterExpression
  orderBys?: GA4OrderBy[]
  limit?: number
  offset?: number
  keepEmptyRows?: boolean
}

export interface GA4DimensionHeader {
  name: string
}

export interface GA4MetricHeader {
  name: string
  type: 'TYPE_UNSPECIFIED' | 'TYPE_INTEGER' | 'TYPE_FLOAT' | 'TYPE_SECONDS' | 'TYPE_MILLISECONDS' | 'TYPE_MINUTES' | 'TYPE_HOURS' | 'TYPE_STANDARD' | 'TYPE_CURRENCY' | 'TYPE_FEET' | 'TYPE_MILES' | 'TYPE_METERS' | 'TYPE_KILOMETERS'
}

export interface GA4DimensionValue {
  value: string
}

export interface GA4MetricValue {
  value: string
}

export interface GA4Row {
  dimensionValues: GA4DimensionValue[]
  metricValues: GA4MetricValue[]
}

export interface GA4Response {
  dimensionHeaders: GA4DimensionHeader[]
  metricHeaders: GA4MetricHeader[]
  rows: GA4Row[]
  rowCount?: number
  metadata?: {
    currencyCode?: string
    timeZone?: string
  }
  kind?: string
}

export interface ProcessedGA4Results {
  data: any[]
  summary: {
    totalRows: number
    dateRange: string
    propertyId: string
  }
  metadata?: {
    currencyCode?: string
    timeZone?: string
  }
}

export type Intent =
  | 'traffic'
  | 'conversions'
  | 'events'
  | 'ecommerce'
  | 'engagement'
  | 'acquisition'
  | 'demographics'
  | 'technology'
  | 'pages'
  | 'custom'

export interface PromptContext {
  comparison?: {
    main: DateRange
    comparison: DateRange
  }
  dateRange?: DateRange
}
