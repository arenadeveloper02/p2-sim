/**
 * GA4 API Constants
 */

export const GA4_API_VERSION = 'v1beta'
export const GA4_API_BASE_URL = 'https://analyticsdata.googleapis.com'

/**
 * GA4 Properties Configuration
 * Property IDs from Google Analytics 4 accounts
 */
export const GA4_PROPERTIES: Record<string, { id: string; name: string }> = {
  acalvio: { id: '89249870', name: 'Acalvio' },
  al_fire: { id: '108820304', name: 'Al Fire' },
  altula: { id: '30134064', name: 'Altula' },
  aptc: { id: '44022520', name: 'APTC' },
  arena_calibrate: { id: '198007515', name: 'ArenaCalibrate' },
  armor_analytics: { id: '37140580', name: 'Armor Analytics' },
  au_eventgroove: { id: '10334305', name: 'AU - eventgroove.com.au' },
  bared: { id: '112717872', name: 'BARED' },
  build_n_care: { id: '48593548', name: 'Build N Care' },
  ca_eventgroove: { id: '28973577', name: 'CA - eventgroove.ca' },
  capitalcitynurses: { id: '35460305', name: 'Capitalcitynurses.com' },
  care_advantage: { id: '112973226', name: 'Care Advantage' },
  chancey_reynolds: { id: '188026798', name: 'Chancey & Reynolds (New)' },
  covalent_metrology: { id: '173920588', name: 'Covalent Metrology' },
  drip_capital: { id: '54624908', name: 'Drip Capital' },
  englert_leafguard: { id: '15161193', name: 'Englert LeafGuard' },
  epstein_jeffrey_1: { id: '19992251', name: 'Epstein, Jeffrey' },
  epstein_jeffrey_2: { id: '15990503', name: 'Epstein, Jeffrey' },
  etc_group: { id: '169034142', name: 'ETC Group' },
  floor_tools: { id: '197252857', name: 'FloorTools' },
  garramone_new: { id: '253446859', name: 'Garramone NEW' },
  gentle_dental: { id: '2300720', name: 'Gentle Dental' },
  great_lakes_corp: { id: '151578158', name: 'Great Lakes Corp' },
  gtm_leader_society: { id: '366055823', name: 'GTM leader society' },
  healthrhythms: { id: '71580287', name: 'healthrhythms' },
  howell_chase: { id: '341778160', name: 'Howell-Chase Heating & Air Conditioning' },
  inc_media: { id: '98096820', name: 'Inc. media' },
  inspire_aesthetics: { id: '288674034', name: 'Inspire Aesthetics' },
}

/**
 * Common GA4 Dimensions
 */
export const GA4_DIMENSIONS = {
  // Date & Time
  date: 'date',
  year: 'year',
  month: 'month',
  week: 'week',
  day: 'day',
  hour: 'hour',
  
  // Geography
  country: 'country',
  region: 'region',
  city: 'city',
  continent: 'continent',
  
  // Technology
  deviceCategory: 'deviceCategory',
  operatingSystem: 'operatingSystem',
  browser: 'browser',
  screenResolution: 'screenResolution',
  
  // Traffic Sources
  sessionSource: 'sessionSource',
  sessionMedium: 'sessionMedium',
  sessionCampaignName: 'sessionCampaignName',
  sessionDefaultChannelGroup: 'sessionDefaultChannelGroup',
  sessionSourceMedium: 'sessionSourceMedium',
  
  // Content
  pagePath: 'pagePath',
  pageTitle: 'pageTitle',
  landingPage: 'landingPage',
  
  // Events
  eventName: 'eventName',
  
  // User
  newVsReturning: 'newVsReturning',
  userAgeBracket: 'userAgeBracket',
  userGender: 'userGender',
  
  // Ecommerce
  itemName: 'itemName',
  itemCategory: 'itemCategory',
  transactionId: 'transactionId',
} as const

/**
 * Common GA4 Metrics
 */
export const GA4_METRICS = {
  // Users & Sessions
  totalUsers: 'totalUsers',
  newUsers: 'newUsers',
  activeUsers: 'activeUsers',
  sessions: 'sessions',
  sessionsPerUser: 'sessionsPerUser',
  
  // Engagement
  engagementRate: 'engagementRate',
  engagedSessions: 'engagedSessions',
  averageSessionDuration: 'averageSessionDuration',
  screenPageViews: 'screenPageViews',
  screenPageViewsPerSession: 'screenPageViewsPerSession',
  eventCount: 'eventCount',
  eventsPerSession: 'eventsPerSession',
  
  // Conversions
  conversions: 'conversions',
  totalRevenue: 'totalRevenue',
  
  // Bounce & Exit
  bounceRate: 'bounceRate',
  
  // Ecommerce
  itemRevenue: 'itemRevenue',
  itemsPurchased: 'itemsPurchased',
  purchaseRevenue: 'purchaseRevenue',
  transactions: 'transactions',
  averagePurchaseRevenue: 'averagePurchaseRevenue',
  
  // Events
  eventCountPerUser: 'eventCountPerUser',
} as const

/**
 * Default query limits
 */
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 100000

/**
 * Date format for GA4 API
 */
export const GA4_DATE_FORMAT = 'YYYY-MM-DD'

/**
 * Date range limits
 */
export const MAX_DAYS_FOR_LAST_N_DAYS = 365
export const MAX_MONTHS_FOR_LAST_N_MONTHS = 24

/**
 * Common dimension/metric combinations for different intents
 */
export const INTENT_TEMPLATES = {
  traffic: {
    dimensions: ['date', 'sessionSource', 'sessionMedium'],
    metrics: ['sessions', 'totalUsers', 'screenPageViews', 'bounceRate'],
  },
  conversions: {
    dimensions: ['date', 'sessionDefaultChannelGroup'],
    metrics: ['conversions', 'totalRevenue', 'sessions'],
  },
  events: {
    dimensions: ['eventName', 'date'],
    metrics: ['eventCount', 'totalUsers'],
  },
  ecommerce: {
    dimensions: ['date', 'itemName'],
    metrics: ['itemRevenue', 'itemsPurchased', 'transactions'],
  },
  engagement: {
    dimensions: ['date', 'pagePath'],
    metrics: ['engagementRate', 'averageSessionDuration', 'screenPageViews'],
  },
  acquisition: {
    dimensions: ['sessionSource', 'sessionMedium', 'sessionCampaignName'],
    metrics: ['newUsers', 'sessions', 'conversions'],
  },
  demographics: {
    dimensions: ['userAgeBracket', 'userGender', 'country'],
    metrics: ['totalUsers', 'sessions', 'engagementRate'],
  },
  technology: {
    dimensions: ['deviceCategory', 'operatingSystem', 'browser'],
    metrics: ['sessions', 'totalUsers', 'bounceRate'],
  },
  pages: {
    dimensions: ['pagePath', 'pageTitle'],
    metrics: ['screenPageViews', 'averageSessionDuration', 'bounceRate'],
  },
} as const
