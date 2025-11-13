import { createLogger } from '@/lib/logs/console/logger'
import { google } from 'googleapis'
import type { GA4Query, GA4Response } from './types'

const logger = createLogger('GA4API')

/**
 * GA4 API Client
 * Handles authentication and query execution against Google Analytics Data API v1
 */
export class GA4ApiClient {
  private analyticsData: any
  private propertyId: string

  constructor(propertyId: string, credentials?: any) {
    this.propertyId = propertyId

    // Initialize Google Analytics Data API client
    const auth = credentials
      ? new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
        })
      : new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
        })

    this.analyticsData = google.analyticsdata({
      version: 'v1beta',
      auth,
    })
  }

  /**
   * Execute a GA4 runReport query
   */
  async runReport(query: Omit<GA4Query, 'propertyId'>): Promise<GA4Response> {
    try {
      logger.info('Executing GA4 runReport', {
        propertyId: this.propertyId,
        dateRanges: query.dateRanges,
        dimensions: query.dimensions?.map((d) => d.name),
        metrics: query.metrics.map((m) => m.name),
      })

      const response = await this.analyticsData.properties.runReport({
        property: `properties/${this.propertyId}`,
        requestBody: {
          dateRanges: query.dateRanges,
          dimensions: query.dimensions,
          metrics: query.metrics,
          dimensionFilter: query.dimensionFilter,
          metricFilter: query.metricFilter,
          orderBys: query.orderBys,
          limit: query.limit,
          offset: query.offset,
          keepEmptyRows: query.keepEmptyRows,
        },
      })

      logger.info('GA4 runReport successful', {
        rowCount: response.data.rowCount,
        dimensionHeaders: response.data.dimensionHeaders?.length,
        metricHeaders: response.data.metricHeaders?.length,
      })

      return response.data as GA4Response
    } catch (error: any) {
      logger.error('GA4 runReport failed', {
        error: error.message,
        code: error.code,
        details: error.errors,
      })
      throw new Error(`GA4 API Error: ${error.message}`)
    }
  }

  /**
   * Execute a batch runReport query (multiple date ranges)
   */
  async batchRunReports(queries: Array<Omit<GA4Query, 'propertyId'>>): Promise<GA4Response[]> {
    try {
      logger.info('Executing GA4 batchRunReports', {
        propertyId: this.propertyId,
        queryCount: queries.length,
      })

      const response = await this.analyticsData.properties.batchRunReports({
        property: `properties/${this.propertyId}`,
        requestBody: {
          requests: queries.map((query) => ({
            dateRanges: query.dateRanges,
            dimensions: query.dimensions,
            metrics: query.metrics,
            dimensionFilter: query.dimensionFilter,
            metricFilter: query.metricFilter,
            orderBys: query.orderBys,
            limit: query.limit,
            offset: query.offset,
            keepEmptyRows: query.keepEmptyRows,
          })),
        },
      })

      logger.info('GA4 batchRunReports successful', {
        reportCount: response.data.reports?.length,
      })

      return response.data.reports as GA4Response[]
    } catch (error: any) {
      logger.error('GA4 batchRunReports failed', {
        error: error.message,
        code: error.code,
        details: error.errors,
      })
      throw new Error(`GA4 Batch API Error: ${error.message}`)
    }
  }

  /**
   * Get property metadata
   */
  async getMetadata(): Promise<any> {
    try {
      const response = await this.analyticsData.properties.getMetadata({
        name: `properties/${this.propertyId}/metadata`,
      })

      return response.data
    } catch (error: any) {
      logger.error('GA4 getMetadata failed', {
        error: error.message,
      })
      throw new Error(`GA4 Metadata Error: ${error.message}`)
    }
  }
}

/**
 * Create GA4 API client from environment variables or provided credentials
 */
export function createGA4Client(propertyId: string, credentials?: any): GA4ApiClient {
  return new GA4ApiClient(propertyId, credentials)
}
