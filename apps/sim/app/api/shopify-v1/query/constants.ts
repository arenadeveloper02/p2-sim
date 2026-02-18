/**
 * Constants for Shopify V1 API
 */

/**
 * Current date reference for GraphQL query generation
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

/**
 * Shopify API version
 */
export const SHOPIFY_API_VERSION = '2024-01'
