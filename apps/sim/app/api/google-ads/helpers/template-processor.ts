// PPC Template Processor - Handles dynamic template execution

import { createLogger } from '@/lib/logs/console/logger'
import { getAccountId, GOOGLE_ADS_ACCOUNTS } from './utils'
import type { PPCTemplate, PPCReportResult } from './ppc-templates'
import { PPC_TEMPLATES, validateTemplateParams } from './ppc-templates'

const logger = createLogger('PPCTemplateProcessor')

export class PPCTemplateProcessor {
  /**
   * Main entry point for processing PPC templates
   */
  static async processTemplate(
    templateId: string,
    params: Record<string, any>
  ): Promise<PPCReportResult> {
    logger.info('Processing PPC template', { templateId, params })

    const template = PPC_TEMPLATES[templateId]
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    // 1. Validate required parameters
    const validationErrors = this.validateParams(template, params)
    if (validationErrors.length > 0) {
      throw new Error(`Validation errors: ${validationErrors.join(', ')}`)
    }

    // 2. Generate dynamic GAQL queries based on template
    const queries = this.generateQueries(template, params)
    logger.info('Generated GAQL queries', { templateId, queryCount: queries.length })

    // 3. Execute API calls for multiple accounts/periods
    const data = await this.executeQueries(queries, params.accounts)
    logger.info('Executed queries', { templateId, dataLength: data.length })

    // 4. Process data according to template format
    const result = this.formatOutput(template, data, params)
    logger.info('Formatted output', { templateId, outputFormat: template.outputFormat })

    return result
  }

  /**
   * Validate template parameters
   */
  private static validateParams(template: PPCTemplate, params: Record<string, any>): string[] {
    return validateTemplateParams(template, params)
  }

  /**
   * Generate GAQL queries based on template type
   */
  private static generateQueries(template: PPCTemplate, params: any): Array<{
    accountId: string
    accountName: string
    query: string
    period?: string
  }> {
    const queries: Array<{
      accountId: string
      accountName: string
      query: string
      period?: string
    }> = []

    // Handle multiple accounts
    const accounts = Array.isArray(params.accounts) ? params.accounts : [params.accounts]
    
    for (const accountKey of accounts) {
      const accountInfo = GOOGLE_ADS_ACCOUNTS[accountKey]
      if (!accountInfo) {
        logger.warn('Account not found', { accountKey })
        continue
      }

      switch (template.id) {
        case 'performance_highlights':
          queries.push(...this.generatePerformanceQueries(accountInfo, params))
          break
        case 'asset_gap':
          queries.push(...this.generateAssetQueries(accountInfo, params))
          break
        case 'sqr_analysis':
          queries.push(...this.generateSQRQueries(accountInfo, params))
          break
        case 'top_spending_keywords':
          queries.push(...this.generateKeywordQueries(accountInfo, params))
          break
        case 'segment_analysis':
          queries.push(...this.generateSegmentQueries(accountInfo, params))
          break
        case 'geo_performance':
          queries.push(...this.generateGeoQueries(accountInfo, params))
          break
        default:
          logger.warn('Unknown template type', { templateId: template.id })
      }
    }

    return queries
  }

  /**
   * Generate Performance Highlights queries
   */
  private static generatePerformanceQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    const { startDate, endDate } = params
    
    // Generate month-by-month queries
    const months = this.getMonthsBetween(startDate, endDate)
    
    return months.map(month => ({
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      period: month.label,
      query: `
        SELECT 
          campaign.name,
          campaign.status,
          metrics.cost_micros,
          metrics.conversions,
          segments.month
        FROM campaign
        WHERE campaign.status != 'REMOVED'
          AND segments.date BETWEEN '${month.start}' AND '${month.end}'
        ORDER BY metrics.cost_micros DESC
      `
    }))
  }

  /**
   * Generate Asset Gap queries
   */
  private static generateAssetQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    return [{
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          campaign.name,
          campaign.status,
          ad_group.name,
          ad_group.status,
          ad_group_ad.ad.id,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group_ad.status
        FROM ad_group_ad
        WHERE campaign.status != 'REMOVED'
          AND ad_group.status != 'REMOVED'
          AND ad_group_ad.status != 'REMOVED'
          AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
      `
    }, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          campaign.name,
          campaign.status,
          asset.sitelink_asset.link_text,
          asset.callout_asset.callout_text,
          asset.structured_snippet_asset.header,
          campaign_asset.status
        FROM campaign_asset
        WHERE campaign.status != 'REMOVED'
          AND campaign_asset.status != 'REMOVED'
      `
    }]
  }

  /**
   * Generate Search Query Report queries
   */
  private static generateSQRQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    const { startDate, endDate } = params
    
    return [{
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          search_term_view.search_term,
          metrics.cost_micros,
          metrics.conversions,
          metrics.clicks,
          campaign.name,
          ad_group.name
        FROM search_term_view
        WHERE campaign.status != 'REMOVED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
        ORDER BY metrics.cost_micros DESC
      `
    }]
  }

  /**
   * Generate Keyword Performance queries
   */
  private static generateKeywordQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    const { startDate, endDate } = params
    
    return [{
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          campaign.name,
          ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.search_impression_share,
          segments.week
        FROM keyword_view
        WHERE campaign.status != 'REMOVED'
          AND ad_group.status != 'REMOVED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
        ORDER BY metrics.cost_micros DESC
      `
    }]
  }

  /**
   * Generate Segment Analysis queries
   */
  private static generateSegmentQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    const { startDate, endDate } = params
    
    const segments = [
      'segments.day_of_week',
      'segments.hour',
      'segments.age_range',
      'segments.gender',
      'segments.device',
      'segments.ad_network_type',
      'segments.geo_target_city'
    ]

    return segments.map(segment => ({
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          ${segment},
          campaign.advertising_channel_type,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE campaign.status != 'REMOVED'
          AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      `
    }))
  }

  /**
   * Generate Geographic Performance queries
   */
  private static generateGeoQueries(
    accountInfo: { id: string; name: string },
    params: any
  ) {
    return [{
      accountId: accountInfo.id,
      accountName: accountInfo.name,
      query: `
        SELECT 
          geographic_view.location_type,
          geographic_view.country_criterion_id,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversion_value_micros
        FROM geographic_view
        WHERE campaign.status != 'REMOVED'
      `
    }]
  }

  /**
   * Execute multiple queries across accounts using REAL Google Ads API
   */
  private static async executeQueries(
    queries: Array<{
      accountId: string
      accountName: string
      query: string
      period?: string
    }>,
    accounts: string[]
  ): Promise<any[]> {
    logger.info('Executing REAL Google Ads API queries', { queryCount: queries.length })
    
    const results = []
    for (const queryInfo of queries) {
      try {
        logger.info('Making real Google Ads API call', { 
          accountId: queryInfo.accountId,
          accountName: queryInfo.accountName,
          period: queryInfo.period
        })

        // Use the existing makeGoogleAdsRequest function for REAL API calls
        const apiResponse = await this.makeGoogleAdsRequest(queryInfo.accountId, queryInfo.query)
        
        const result = {
          accountId: queryInfo.accountId,
          accountName: queryInfo.accountName,
          period: queryInfo.period,
          query: queryInfo.query,
          data: apiResponse || [] // Real Google Ads API response
        }
        
        results.push(result)
        
        logger.info('Successfully executed Google Ads query', { 
          accountId: queryInfo.accountId,
          dataLength: Array.isArray(apiResponse) ? apiResponse.length : 0
        })
        
      } catch (error) {
        logger.error('Google Ads API query execution failed', { 
          accountId: queryInfo.accountId,
          accountName: queryInfo.accountName,
          error: error instanceof Error ? error.message : String(error)
        })
        
        // Still add to results but with empty data and error info
        results.push({
          accountId: queryInfo.accountId,
          accountName: queryInfo.accountName,
          period: queryInfo.period,
          query: queryInfo.query,
          data: [],
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    
    return results
  }

  /**
   * Make Google Ads API request - copied from existing route.ts
   */
  private static async makeGoogleAdsRequest(accountId: string, gaqlQuery: string): Promise<any> {
    logger.info('Making real Google Ads API request', { accountId, gaqlQuery })

    try {
      // Get Google Ads API credentials from environment variables
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      const clientId = process.env.GOOGLE_ADS_CLIENT_ID
      const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
      const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

      if (!clientId || !clientSecret || !refreshToken || !developerToken) {
        throw new Error(
          'Missing Google Ads API credentials. Please set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN environment variables.'
        )
      }

      // Prepare token request body
      const tokenRequestBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      })

      // Get access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenRequestBody,
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const accessToken = tokenData.access_token

      // Make Google Ads API request
      const apiUrl = `https://googleads.googleapis.com/v19/customers/${accountId}/googleAds:searchStream`
      
      const requestBody = {
        query: gaqlQuery,
      }

      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': '4455285084', // Position2 Manager MCC
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text()
        throw new Error(`Google Ads API request failed: ${apiResponse.status} - ${errorText}`)
      }

      const responseData = await apiResponse.json()
      logger.info('Google Ads API response received', { 
        accountId,
        hasResults: !!responseData.results,
        resultCount: responseData.results?.length || 0
      })

      return responseData.results || []

    } catch (error) {
      logger.error('Google Ads API request failed', { 
        accountId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Format output based on template requirements
   */
  private static formatOutput(
    template: PPCTemplate,
    data: any[],
    params: any
  ): PPCReportResult {
    const result: PPCReportResult = {
      templateId: template.id,
      templateName: template.name,
      accounts: Array.isArray(params.accounts) ? params.accounts : [params.accounts],
      dateRange: {
        startDate: params.startDate || '',
        endDate: params.endDate || ''
      },
      data: data,
      tables: {},
      insights: [],
      recommendations: []
    }

    switch (template.outputFormat) {
      case 'table_with_analysis':
        result.tables = this.formatTableWithAnalysis(template, data)
        result.analysis = this.generateAnalysis(template, data)
        break
      case 'structured_table':
        result.tables = this.formatStructuredTable(template, data)
        break
      case 'dual_table':
        result.tables = this.formatDualTable(template, data)
        break
      default:
        result.tables = { main: data }
    }

    return result
  }

  /**
   * Helper methods for formatting different output types
   */
  private static formatTableWithAnalysis(template: PPCTemplate, data: any[]) {
    // Implementation specific to table with analysis format
    return {
      main_table: data,
      summary: this.generateSummaryTable(data)
    }
  }

  private static formatStructuredTable(template: PPCTemplate, data: any[]) {
    // Implementation for structured table format
    return {
      asset_gaps: data
    }
  }

  private static formatDualTable(template: PPCTemplate, data: any[]) {
    // Implementation for dual table format (positive/negative keywords)
    return {
      positive_keywords: [],
      negative_keywords: []
    }
  }

  private static generateAnalysis(template: PPCTemplate, data: any[]): string {
    // Generate insights based on template type and data
    return `Analysis for ${template.name}: Generated from ${data.length} data points.`
  }

  private static generateSummaryTable(data: any[]) {
    // Generate summary statistics
    return data
  }

  /**
   * Utility function to get months between two dates
   */
  private static getMonthsBetween(startDate: string, endDate: string) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const months = []
    
    const current = new Date(start.getFullYear(), start.getMonth(), 1)
    
    while (current <= end) {
      const monthStart = new Date(current)
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
      
      months.push({
        label: current.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
        start: monthStart.toISOString().split('T')[0],
        end: monthEnd.toISOString().split('T')[0]
      })
      
      current.setMonth(current.getMonth() + 1)
    }
    
    return months
  }
}
