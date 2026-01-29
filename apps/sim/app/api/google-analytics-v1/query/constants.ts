/**
 * Constants for Google Analytics v1 API
 */

/**
 * Current date reference for GA4 query generation
 * Dynamically calculated to always reflect the actual current date
 */
export const CURRENT_DATE = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/**
 * Default date range in days when no date is specified
 */
export const DEFAULT_DATE_RANGE_DAYS = 30

/**
 * Google Analytics properties mapping
 * These are GA4 property IDs that users can query
 */
export const GA4_PROPERTIES: Record<string, { id: string; name: string; displayName: string }> = {
  // Add your GA4 properties here
  // Example:
  // website_property: { id: '123456789', name: 'Main Website', displayName: 'Main Website Analytics' },
  // app_property: { id: '987654321', name: 'Mobile App', displayName: 'Mobile App Analytics' },
}

/**
 * GA4 API endpoints
 */
export const GA4_API_ENDPOINTS = {
  DATA_API: 'https://analyticsdata.googleapis.com/v1beta',
  ADMIN_API: 'https://analyticsadmin.googleapis.com/v1alpha',
}

/**
 * GA4 date presets (same as Google Ads for consistency)
 */
export const GA4_DATE_PRESETS = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7_DAYS: 'last_7_days',
  LAST_14_DAYS: 'last_14_days',
  LAST_30_DAYS: 'last_30_days',
  LAST_90_DAYS: 'last_90_days',
  LAST_12_MONTHS: 'last_12_months',
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
  THIS_QUARTER: 'this_quarter',
  LAST_QUARTER: 'last_quarter',
  THIS_YEAR: 'this_year',
  LAST_YEAR: 'last_year',
} as const

/**
 * GA4 dimensions available for querying
 */
export const GA4_DIMENSIONS = {
  // Date dimensions
  DATE: 'date',
  YEAR: 'year',
  MONTH: 'month',
  WEEK: 'week',
  DAY_OF_WEEK: 'dayOfWeek',
  HOUR: 'hour',
  
  // Geographic dimensions
  COUNTRY: 'country',
  REGION: 'region',
  CITY: 'city',
  
  // Device dimensions
  DEVICE_CATEGORY: 'deviceCategory',
  BROWSER: 'browser',
  OPERATING_SYSTEM: 'operatingSystem',
  
  // Traffic dimensions
  SESSION_SOURCE: 'sessionSource',
  SESSION_MEDIUM: 'sessionMedium',
  SESSION_CAMPAIGN: 'sessionCampaign',
  
  // Page dimensions
  PAGE_PATH: 'pagePath',
  PAGE_TITLE: 'pageTitle',
  SCREEN_NAME: 'screenName',
  
  // User dimensions
  NEW_VS_RETURNING: 'newVsReturning',
  USER_TYPE: 'userType',
} as const

/**
 * GA4 metrics available for querying
 */
export const GA4_METRICS = {
  // Session metrics
  SESSIONS: 'sessions',
  ACTIVE_USERS: 'activeUsers',
  USERS: 'users',
  
  // Engagement metrics
  ENGAGEMENT_RATE: 'engagementRate',
  ENGAGED_SESSIONS: 'engagedSessions',
  AVERAGE_ENGAGEMENT_TIME: 'averageEngagementTime',
  
  // Page view metrics
  PAGE_VIEWS: 'pageViews',
  VIEWS_PER_USER: 'viewsPerUser',
  
  // Conversion metrics
  CONVERSIONS: 'conversions',
  TOTAL_REVENUE: 'totalRevenue',
  
  // Event metrics
  EVENT_COUNT: 'eventCount',
  
  // Time metrics
  AVERAGE_SESSION_DURATION: 'averageSessionDuration',
  BOUNCE_RATE: 'bounceRate',
} as const
