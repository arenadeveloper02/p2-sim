/**
 * Type definitions for Google Ads GAQL schema
 */

export interface GaqlResource {
  name: string
  category: string
  description: string
  fields: string[]
  requiredFields: string[]
  supportsSegmentsDate: boolean
  supportsMetrics: boolean
  notes?: string
}

export interface GaqlMetric {
  name: string
  category: string
  description: string
  unit?: string
  notes?: string
}

export interface GaqlSegment {
  name: string
  category: string
  description: string
  values?: string[]
  notes?: string
}
