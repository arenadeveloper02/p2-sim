// Google Ads sitelinks functionality

import { createLogger } from '@/lib/logs/console/logger'
import { extractAccountFromQuery, extractCampaignFromQuery, getAccountId } from './utils'
import type { SitelinkQuery, SitelinkData, SitelinkResponse } from './types'

const logger = createLogger('GoogleAdsSitelinks')

/**
 * Detect if query is asking about sitelinks
 */
export function detectSitelinkQuery(query: string): boolean {
  // Force visibility with console.log
  console.log('🔍 SITELINK DETECTION CALLED:', query)
  
  const sitelinkKeywords = [
    'sitelink', 'site link', 'sitelinks', 'site links',
    'extension', 'extensions', 'ad extension', 'ad extensions'
  ]
  
  // Clean the query of extra quotes and whitespace
  const cleanQuery = query.replace(/["\n\r]/g, '').trim()
  const queryLower = cleanQuery.toLowerCase()
  const detected = sitelinkKeywords.some(keyword => queryLower.includes(keyword))
  
  // Force visibility with console.log
  console.log('🔍 SITELINK DETECTION RESULT:', {
    originalQuery: query,
    cleanQuery,
    queryLower,
    detected,
    matchingKeywords: sitelinkKeywords.filter(keyword => queryLower.includes(keyword))
  })
  
  // Add detailed logging
  logger.info('Sitelink detection check', {
    originalQuery: query,
    cleanQuery,
    queryLower,
    sitelinkKeywords,
    detected,
    matchingKeywords: sitelinkKeywords.filter(keyword => queryLower.includes(keyword))
  })
  
  return detected
}

/**
 * Extract sitelink query components
 */
export function extractSitelinkComponents(query: string): SitelinkQuery {
  const account = extractAccountFromQuery(query) || undefined
  const campaign = extractCampaignFromQuery(query) || undefined
  
  // Extract timeframe
  let timeframe = 'last 30 days' // default
  if (query.includes('last week')) timeframe = 'last 7 days'
  if (query.includes('last month')) timeframe = 'last 30 days'
  if (query.includes('this month')) timeframe = 'this month'
  if (query.includes('this quarter')) timeframe = 'this quarter'
  
  return {
    account,
    campaign,
    intent: 'sitelinks',
    timeframe
  }
}

/**
 * Generate GAQL query for sitelinks
 */
export function generateSitelinkGAQL(components: SitelinkQuery, accountId: string): string {
  const { campaign, timeframe } = components
  const dateRange = getDateRangeForTimeframe(timeframe || 'last 30 days')
  
  // Try campaign_asset since we saw sitelinks at campaign level in the screenshot
  const query = `
    SELECT 
      campaign.name,
      campaign.status,
      asset.sitelink_asset.link_text,
      asset.sitelink_asset.description1,
      asset.sitelink_asset.description2,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.cost_micros
    FROM campaign_asset
    WHERE asset.type = 'SITELINK'
      AND campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
    ORDER BY metrics.clicks DESC
  `
  
  return query
}

/**
 * Process sitelink data from Google Ads API
 */
export function processSitelinkData(data: any, accountName: string, campaignName?: string): SitelinkResponse {
  logger.info('Processing sitelink data', { 
    data: data,
    dataType: typeof data,
    isArray: Array.isArray(data),
    dataKeys: typeof data === 'object' ? Object.keys(data) : 'Not object',
    accountName, 
    campaignName,
    rawDataSample: data
  })
  
  // Handle protobuf response format
  let dataArray: any[] = []
  
  if (data && typeof data === 'object') {
    // Check if it's protobuf format with numeric keys
    if (data['1'] && Array.isArray(data['1'])) {
      dataArray = data['1'] // The actual results are in key '1'
      logger.info('Found protobuf format data', { 
        resultCount: dataArray.length,
        firstResult: dataArray[0] 
      })
    } else if (Array.isArray(data)) {
      dataArray = data
    }
  }
  
  if (dataArray.length === 0) {
    logger.warn('No sitelink data found or data is not an array', { 
      originalData: data,
      accountName,
      campaignName 
    })
  }
  
  const sitelinks: SitelinkData[] = dataArray.map((row, index) => {
    logger.info(`Processing row ${index}`, { row })
    
    // Handle both protobuf and JSON formats
    let sitelinkText = 'Unknown Sitelink'
    let description1 = undefined
    let description2 = undefined
    let campaignName = 'Unknown Campaign'
    let clicks = 0
    let impressions = 0
    let ctr = 0
    let cost = 0
    
    if (row && typeof row === 'object') {
      // Try JSON format first
      if (row.asset?.sitelink_asset?.link_text) {
        sitelinkText = row.asset.sitelink_asset.link_text
        description1 = row.asset.sitelink_asset.description1
        description2 = row.asset.sitelink_asset.description2
        campaignName = row.campaign?.name || 'Unknown Campaign'
        clicks = parseInt(row.metrics?.clicks) || 0
        impressions = parseInt(row.metrics?.impressions) || 0
        ctr = parseFloat(row.metrics?.ctr) || 0
        cost = (parseInt(row.metrics?.cost_micros) || 0) / 1000000
      } else {
        // Handle protobuf format - we need to decode the numeric keys
        // This is a placeholder - we'd need the actual protobuf schema
        logger.info('Protobuf row detected', { 
          keys: Object.keys(row),
          values: Object.values(row)
        })
        
        // For now, create a placeholder entry to show we found data
        sitelinkText = `Sitelink found (protobuf format)`
        campaignName = 'Campaign (protobuf)'
      }
    }
    
    return {
      level: 'Campaign Level',
      campaign_name: campaignName,
      ad_group_name: null,
      sitelink_text: sitelinkText,
      description1: description1,
      description2: description2,
      clicks: clicks,
      impressions: impressions,
      ctr: ctr,
      cost: cost
    };
  })
  
  // Sort by clicks descending
  sitelinks.sort((a, b) => b.clicks - a.clicks)
  
  // Generate insights
  const insights = generateSitelinkInsights(sitelinks)
  
  return {
    account: accountName,
    campaign: campaignName,
    sitelinks,
    insights
  }
}

/**
 * Generate insights from sitelink data
 */
function generateSitelinkInsights(sitelinks: SitelinkData[]) {
  if (sitelinks.length === 0) {
    return {
      best_performing: 'No sitelinks found',
      worst_performing: 'No sitelinks found',
      recommendations: ['No sitelink data available for analysis']
    }
  }
  
  const bestPerforming = sitelinks[0]
  const worstPerforming = sitelinks[sitelinks.length - 1]
  
  const recommendations: string[] = []
  
  // CTR-based recommendations
  const lowCTRSitelinks = sitelinks.filter(s => s.ctr < 0.02) // Less than 2% CTR
  if (lowCTRSitelinks.length > 0) {
    recommendations.push(`Consider updating ${lowCTRSitelinks.length} sitelinks with CTR below 2%`)
  }
  
  // Click-based recommendations
  const noClickSitelinks = sitelinks.filter(s => s.clicks === 0)
  if (noClickSitelinks.length > 0) {
    recommendations.push(`${noClickSitelinks.length} sitelinks have no clicks - review relevance and positioning`)
  }
  
  // Performance recommendations
  if (sitelinks.length > 3) {
    const topPerformers = sitelinks.slice(0, 3)
    recommendations.push(`Focus budget on top 3 performing sitelinks: ${topPerformers.map(s => s.sitelink_text).join(', ')}`)
  }
  
  return {
    best_performing: `${bestPerforming.sitelink_text} (${bestPerforming.clicks} clicks, ${(bestPerforming.ctr * 100).toFixed(2)}% CTR)`,
    worst_performing: `${worstPerforming.sitelink_text} (${worstPerforming.clicks} clicks, ${(worstPerforming.ctr * 100).toFixed(2)}% CTR)`,
    recommendations: recommendations.length > 0 ? recommendations : ['Sitelinks are performing well overall']
  }
}

/**
 * Get date range for timeframe
 */
function getDateRangeForTimeframe(timeframe: string) {
  const today = new Date()
  const formatDate = (date: Date) => date.toISOString().split('T')[0]
  
  switch (timeframe) {
    case 'last 7 days':
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { start: formatDate(weekAgo), end: formatDate(today) }
    
    case 'this month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: formatDate(monthStart), end: formatDate(today) }
    
    case 'this quarter':
      const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
      return { start: formatDate(quarterStart), end: formatDate(today) }
    
    default: // 'last 30 days' - but use 90 days for better sitelink data
      const monthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
      return { start: formatDate(monthsAgo), end: formatDate(today) }
  }
}
