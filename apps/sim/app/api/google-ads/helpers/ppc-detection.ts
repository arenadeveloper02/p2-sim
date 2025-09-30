// PPC Template Detection - Identifies which template to use based on query

import { createLogger } from '@/lib/logs/console/logger'
import { PPC_TEMPLATES } from './ppc-templates'

const logger = createLogger('PPCDetection')

/**
 * Detect if query matches a PPC template
 */
export function detectPPCTemplate(query: string): string | null {
  logger.info('Detecting PPC template', { query })

  const queryLower = query.toLowerCase().trim()

  // Performance Highlights keywords
  const performanceKeywords = [
    'performance highlights', 'cpl analysis', 'cost per lead', 'spend analysis',
    'month by month', 'monthly performance', 'lead analysis', 'performance breakdown'
  ]

  // Asset Gap keywords
  const assetKeywords = [
    'asset gap', 'asset analysis', 'missing assets', 'ad extensions gap',
    'headlines missing', 'descriptions missing', 'extension analysis'
  ]

  // SQR keywords
  const sqrKeywords = [
    'search query report', 'sqr analysis', 'search terms', 'keyword opportunities',
    'negative keywords', 'positive keywords', 'search term analysis'
  ]

  // Top Keywords keywords
  const keywordKeywords = [
    'top spending keywords', 'keyword performance', 'top keywords', 'keyword analysis',
    'week on week keywords', 'keyword breakdown'
  ]

  // Segment Analysis keywords
  const segmentKeywords = [
    'segment analysis', 'demographic analysis', 'device performance', 'hour analysis',
    'day of week', 'age analysis', 'gender analysis', 'audience analysis'
  ]

  // Geo Performance keywords
  const geoKeywords = [
    'geo performance', 'geographic analysis', 'location performance', 'geo targeting',
    'location analysis', 'geographic breakdown'
  ]

  // Check each template type
  if (performanceKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected performance highlights template')
    return 'performance_highlights'
  }

  if (assetKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected asset gap template')
    return 'asset_gap'
  }

  if (sqrKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected SQR analysis template')
    return 'sqr_analysis'
  }

  if (keywordKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected top keywords template')
    return 'top_spending_keywords'
  }

  if (segmentKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected segment analysis template')
    return 'segment_analysis'
  }

  if (geoKeywords.some(keyword => queryLower.includes(keyword))) {
    logger.info('Detected geo performance template')
    return 'geo_performance'
  }

  logger.info('No PPC template detected')
  return null
}

/**
 * Extract parameters from query for specific template
 */
export function extractPPCParameters(query: string, templateId: string): Record<string, any> {
  logger.info('Extracting PPC parameters', { query, templateId })

  const params: Record<string, any> = {}
  const queryLower = query.toLowerCase()

  // Extract account names - improved pattern matching
  const accountPatterns = [
    /(AMI|Heartland|NHI|Service Air|Chancey|Reynolds|Phoenix|Rehab|Gentle|Dental)/i,
    /(?:for|analysis for|report for)\s+(AMI|Heartland|NHI|Service Air|Chancey|Reynolds|Phoenix|Rehab|Gentle|Dental)/i,
    /(?:for|account|accounts?)\s+([A-Za-z\s&,-]+?)(?:\s+(?:via|from|in|during|between|business|healthcare|hvac)|$)/i
  ]
  
  let accountText = ''
  for (const pattern of accountPatterns) {
    const match = query.match(pattern)
    if (match) {
      accountText = match[1].trim()
      break
    }
  }
  
  if (accountText) {
    // Map account names to exact keys from GOOGLE_ADS_ACCOUNTS
    const accountMappings: Record<string, string> = {
      'ami': 'ami',
      'ami hvac': 'ami',
      'ami hvac business': 'ami',
      'heartland': 'heartland',
      'heartland healthcare': 'heartland',
      'heartland healthcare business': 'heartland',
      'nhi': 'nhi',
      'service air': 'service_air_eastern_shore',
      'service air eastern shore': 'service_air_eastern_shore',
      'chancey reynolds': 'chancey_reynolds',
      'chancey & reynolds': 'chancey_reynolds',
      'howell chase': 'howell_chase',
      'howell-chase': 'howell_chase',
      'phoenix rehab': 'phoenix_rehab',
      'gentle dental': 'gentle_dental'
    }
    
    const cleanAcc = accountText.trim().toLowerCase()
    const mappedAccount = accountMappings[cleanAcc] || cleanAcc.replace(/\s+/g, '_').toLowerCase()
    
    params.accounts = mappedAccount
    
    logger.info('Account extraction', { 
      originalText: accountText, 
      cleanAcc, 
      mappedAccount,
      availableMappings: Object.keys(accountMappings)
    })
  }

  // Extract date ranges
  const datePatterns = [
    /(?:from|between)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\s+(?:to|and)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})\s+(?:to|and)\s+(\d{4}-\d{2}-\d{2})/,
    /(\w+\s+\d{4})\s+(?:to|and)\s+(\w+\s+\d{4})/i
  ]

  for (const pattern of datePatterns) {
    const match = query.match(pattern)
    if (match) {
      params.startDate = parseDate(match[1])
      params.endDate = parseDate(match[2])
      break
    }
  }

  // Extract template-specific parameters
  switch (templateId) {
    case 'sqr_analysis':
      // Extract target CPA
      const cpaMatch = query.match(/(?:target\s+)?cpa\s+(?:of\s+)?\$?(\d+)/i)
      if (cpaMatch) {
        params.targetCPA = parseInt(cpaMatch[1])
      }
      
      // Extract geographic targets
      const geoMatch = query.match(/(?:geographic|geo|location|county|counties)\s+(?:targeting\s+)?(?:is\s+)?([^.]+)/i)
      if (geoMatch) {
        params.geoTargets = geoMatch[1].trim()
      }
      break

    case 'asset_gap':
      // Extract industry
      const industryMatch = query.match(/(?:industry|business|sector)\s+(?:is\s+)?(\w+)/i)
      if (industryMatch) {
        params.industry = industryMatch[1]
      }
      break
  }

  // Set defaults for missing required parameters and handle parameter name mapping
  const template = PPC_TEMPLATES[templateId]
  if (template) {
    for (const param of template.parameters) {
      // Handle account/accounts parameter name mismatch
      if (param.name === 'account' && !params.account && params.accounts) {
        params.account = Array.isArray(params.accounts) ? params.accounts[0] : params.accounts
      }
      if (param.name === 'accounts' && !params.accounts && params.account) {
        params.accounts = params.account
      }
      
      // Set default values for missing required parameters
      if (param.required && !params[param.name] && param.defaultValue !== undefined) {
        params[param.name] = param.defaultValue
      }
    }
  }

  logger.info('Extracted parameters', { templateId, params })
  return params
}

/**
 * Parse various date formats
 */
function parseDate(dateStr: string): string {
  try {
    // Handle "May 1st, 2025" format
    const cleanDate = dateStr.replace(/(\d+)(?:st|nd|rd|th)/, '$1')
    const date = new Date(cleanDate)
    
    if (isNaN(date.getTime())) {
      // Try ISO format
      return dateStr
    }
    
    return date.toISOString().split('T')[0]
  } catch (error) {
    logger.warn('Failed to parse date', { dateStr, error })
    return dateStr
  }
}

/**
 * Check if query is a PPC template request
 */
export function isPPCTemplateQuery(query: string): boolean {
  return detectPPCTemplate(query) !== null
}
