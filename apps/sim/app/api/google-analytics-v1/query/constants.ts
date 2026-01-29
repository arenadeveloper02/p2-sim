import type { GA4Property } from './types'

export const GA4_PROPERTIES: GA4Property[] = [
  {
    id: 'properties/123456789',
    name: 'Main Website',
    displayName: 'Main Website - GA4'
  },
  {
    id: 'properties/987654321',
    name: 'Mobile App',
    displayName: 'Mobile App - GA4'
  }
]

export const GA4_API_BASE_URL = 'https://analyticsdata.googleapis.com/v1beta'

export const DATE_PRESETS = {
  'today': 'today',
  'yesterday': 'yesterday',
  'last_7_days': '7daysAgo',
  'last_30_days': '30daysAgo',
  'last_90_days': '90daysAgo',
  'this_month': '28daysAgo',
  'last_month': '60daysAgo',
  'this_year': '365daysAgo'
}

export const COMMON_DIMENSIONS = [
  'date',
  'country',
  'city',
  'browser',
  'deviceCategory',
  'operatingSystem',
  'pagePath',
  'pageTitle',
  'sessionSource',
  'sessionMedium',
  'sessionCampaign',
  'landingPage',
  'exitPage',
  'eventName',
  'eventType'
]

export const COMMON_METRICS = [
  'activeUsers',
  'sessions',
  'screenPageViews',
  'conversions',
  'totalRevenue',
  'bounceRate',
  'engagementRate',
  'averageSessionDuration',
  'newUsers',
  'returningUsers',
  'eventCount',
  'eventValue',
  'adClicks',
  'adImpressions',
  'adRevenue'
]
