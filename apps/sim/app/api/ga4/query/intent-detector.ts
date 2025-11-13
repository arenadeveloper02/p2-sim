import { createLogger } from '@/lib/logs/console/logger'
import type { Intent } from './types'

const logger = createLogger('GA4IntentDetector')

/**
 * Detects user intent from natural language query
 */
export function detectIntent(query: string): Intent {
  const lower = query.toLowerCase()

  // Traffic analysis
  if (
    /\b(traffic|visits?|sessions?|visitors?|users?|pageviews?)\b/.test(lower) &&
    !/\b(conversion|revenue|purchase|transaction)\b/.test(lower)
  ) {
    logger.info('Detected intent: traffic')
    return 'traffic'
  }

  // Conversions
  if (/\b(conversion|goal|revenue|purchase|transaction|sales?)\b/.test(lower)) {
    logger.info('Detected intent: conversions')
    return 'conversions'
  }

  // Events
  if (/\b(event|click|download|video|form submit)\b/.test(lower)) {
    logger.info('Detected intent: events')
    return 'events'
  }

  // Ecommerce
  if (/\b(ecommerce|product|item|cart|checkout|order)\b/.test(lower)) {
    logger.info('Detected intent: ecommerce')
    return 'ecommerce'
  }

  // Engagement
  if (/\b(engagement|time on site|session duration|bounce|exit)\b/.test(lower)) {
    logger.info('Detected intent: engagement')
    return 'engagement'
  }

  // Acquisition
  if (/\b(acquisition|source|medium|campaign|channel|referral)\b/.test(lower)) {
    logger.info('Detected intent: acquisition')
    return 'acquisition'
  }

  // Demographics
  if (/\b(demographic|age|gender|location|country|city)\b/.test(lower)) {
    logger.info('Detected intent: demographics')
    return 'demographics'
  }

  // Technology
  if (/\b(device|browser|operating system|mobile|desktop|tablet)\b/.test(lower)) {
    logger.info('Detected intent: technology')
    return 'technology'
  }

  // Pages
  if (/\b(page|url|path|landing|content)\b/.test(lower)) {
    logger.info('Detected intent: pages')
    return 'pages'
  }

  // Default to traffic
  logger.info('No specific intent detected, defaulting to traffic')
  return 'traffic'
}

/**
 * Checks if query is asking for a comparison between two date ranges
 */
export function isComparisonQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return (
    /\b(compare|vs|versus|compared to)\b/.test(lower) ||
    /\band then\b/.test(lower) ||
    (lower.match(/\bto\b/g) || []).length >= 2
  )
}
