/**
 * Constants for Bing Ads API
 */

import { getBingAdsAccounts } from '@/lib/channel-accounts'

// Database-driven Bing Ads accounts - fetched dynamically from database
export const BING_ADS_ACCOUNTS = await getBingAdsAccounts()

// Bing Ads API constants
export const BING_ADS_DEFAULT_CUSTOMER_ID = 'C000736328'
export const BING_ADS_OAUTH_URL = 'https://login.live.com/oauth20_token.srf'
export const POSITION2_CUSTOMER_ID = 'C000736328'

/**
 * Conversion factor from micros to dollars
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
