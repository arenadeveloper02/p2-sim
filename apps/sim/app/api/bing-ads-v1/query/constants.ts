/**
 * Constants for Bing Ads V1 API
 */

import { getBingAdsAccounts } from '@/lib/channel-accounts'

// Database-driven Bing Ads accounts - fetched dynamically from database
export const BING_ADS_ACCOUNTS = await getBingAdsAccounts()

/**
 * Conversion factor from micros to dollars
 * Bing Ads represents currency in micros (1 million micros = 1 dollar)
 */
export const MICROS_PER_DOLLAR = 1000000

/**
 * Current date reference for Bing Ads query generation
 * Dynamically calculated to always reflect the actual current date
 * Format: YYYY-MM-DD for proper date calculations
 */
export const CURRENT_DATE = new Date().toISOString().split('T')[0]

/**
 * Default date range in days when no date is specified
 */
export const DEFAULT_DATE_RANGE_DAYS = 30
