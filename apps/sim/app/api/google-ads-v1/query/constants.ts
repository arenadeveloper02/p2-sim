/**
 * Constants for Google Ads V1 API
 */

/**
 * Conversion factor from micros to dollars
 * Google Ads represents currency in micros (1 million micros = 1 dollar)
 */
export const MICROS_PER_DOLLAR = 1000000

/**
 * Current date reference for GAQL query generation
 * Dynamically calculated to always reflect the actual current date in IST (Indian Standard Time)
 */
export const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Kolkata',
})

/**
 * Default date range in days when no date is specified
 */
export const DEFAULT_DATE_RANGE_DAYS = 30
