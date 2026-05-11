/**
 * Google Ads GAQL Segments
 * Reference: https://developers.google.com/google-ads/api/fields/v17/segments
 */

import type { GaqlSegment } from './types.js'

export const GAQL_SEGMENTS: GaqlSegment[] = [
  // Date / time
  { name: 'segments.date', category: 'date', description: 'Date (YYYY-MM-DD)', notes: 'Use BETWEEN \'YYYY-MM-DD\' AND \'YYYY-MM-DD\'. NEVER use DURING.' },
  { name: 'segments.day_of_week', category: 'date', description: 'Day of week', values: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] },
  { name: 'segments.week', category: 'date', description: 'Week (YYYY-MM-DD of Monday)' },
  { name: 'segments.month', category: 'date', description: 'Month (YYYY-MM-DD of first day)' },
  { name: 'segments.month_of_year', category: 'date', description: 'Month of year', values: ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] },
  { name: 'segments.quarter', category: 'date', description: 'Quarter' },
  { name: 'segments.year', category: 'date', description: 'Year' },
  { name: 'segments.hour', category: 'date', description: 'Hour of day (0-23)' },

  // Device
  { name: 'segments.device', category: 'device', description: 'Device type', values: ['MOBILE', 'TABLET', 'DESKTOP', 'CONNECTED_TV', 'OTHER'] },

  // Network
  { name: 'segments.ad_network_type', category: 'network', description: 'Ad network', values: ['SEARCH', 'SEARCH_PARTNERS', 'CONTENT', 'YOUTUBE_SEARCH', 'YOUTUBE_WATCH', 'MIXED'] },
  { name: 'segments.click_type', category: 'network', description: 'Click type', values: ['HEADLINE', 'SITELINKS', 'CALL_TRACKER', 'CALLS', 'BREADCRUMBS', 'PRODUCT_LISTING_AD', 'STORE_LOCATOR', 'PROMOTION_EXTENSION', 'PRICE_EXTENSION', 'APP_INSTALL', 'APP_DEEPLINK', 'OTHER'] },

  // Geographic
  { name: 'segments.geo_target_country', category: 'geographic', description: 'Country geo target' },
  { name: 'segments.geo_target_region', category: 'geographic', description: 'Region geo target' },
  { name: 'segments.geo_target_metro', category: 'geographic', description: 'Metro geo target' },
  { name: 'segments.geo_target_city', category: 'geographic', description: 'City geo target' },
  { name: 'segments.geo_target_postal_code', category: 'geographic', description: 'Postal code geo target' },

  // Conversion segments
  { name: 'segments.conversion_action', category: 'conversion', description: 'Conversion action resource name' },
  { name: 'segments.conversion_action_name', category: 'conversion', description: 'Conversion action name' },
  { name: 'segments.conversion_action_category', category: 'conversion', description: 'Conversion category', values: ['DEFAULT', 'PAGE_VIEW', 'PURCHASE', 'SIGNUP', 'LEAD', 'DOWNLOAD', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'SUBSCRIBE_PAID', 'PHONE_CALL_LEAD', 'IMPORTED_LEAD', 'SUBMIT_LEAD_FORM', 'BOOK_APPOINTMENT', 'REQUEST_QUOTE', 'GET_DIRECTIONS', 'OUTBOUND_CLICK', 'CONTACT', 'ENGAGEMENT', 'STORE_VISIT', 'STORE_SALE', 'QUALIFIED_LEAD', 'CONVERTED_LEAD'] },
  { name: 'segments.conversion_attribution_event_type', category: 'conversion', description: 'Conversion attribution event', values: ['IMPRESSION', 'INTERACTION'] },

  // Product (Shopping)
  { name: 'segments.product_item_id', category: 'product', description: 'Product item ID' },
  { name: 'segments.product_title', category: 'product', description: 'Product title' },
  { name: 'segments.product_brand', category: 'product', description: 'Product brand' },
  { name: 'segments.product_category', category: 'product', description: 'Product category (full path)' },
  { name: 'segments.product_category_level1', category: 'product', description: 'Product category level 1' },
  { name: 'segments.product_category_level2', category: 'product', description: 'Product category level 2' },
  { name: 'segments.product_category_level3', category: 'product', description: 'Product category level 3' },
  { name: 'segments.product_category_level4', category: 'product', description: 'Product category level 4' },
  { name: 'segments.product_category_level5', category: 'product', description: 'Product category level 5' },
  { name: 'segments.product_channel', category: 'product', description: 'Product channel', values: ['ONLINE', 'LOCAL'] },
  { name: 'segments.product_condition', category: 'product', description: 'Product condition', values: ['NEW', 'USED', 'REFURBISHED'] },
  { name: 'segments.product_country', category: 'product', description: 'Product country' },
  { name: 'segments.product_language', category: 'product', description: 'Product language' },
  { name: 'segments.product_merchant_id', category: 'product', description: 'Merchant Center ID' },
  { name: 'segments.product_store_id', category: 'product', description: 'Product store ID' },
  { name: 'segments.product_custom_attribute0', category: 'product', description: 'Product custom attribute 0' },
  { name: 'segments.product_custom_attribute1', category: 'product', description: 'Product custom attribute 1' },
  { name: 'segments.product_custom_attribute2', category: 'product', description: 'Product custom attribute 2' },
  { name: 'segments.product_custom_attribute3', category: 'product', description: 'Product custom attribute 3' },
  { name: 'segments.product_custom_attribute4', category: 'product', description: 'Product custom attribute 4' },

  // Search term
  { name: 'segments.search_term_match_source', category: 'search', description: 'How search term matched', values: ['KEYWORD', 'DSA_CATEGORY', 'DSA_PAGE_FEED', 'DSA_LOCATION', 'AD_GROUP'] },
  { name: 'segments.search_term_targeting_status', category: 'search', description: 'Search term targeting status', values: ['ADDED', 'EXCLUDED', 'ADDED_EXCLUDED', 'NONE', 'TARGETED'] },
  { name: 'segments.keyword.info.match_type', category: 'search', description: 'Keyword match type', values: ['EXACT', 'PHRASE', 'BROAD'] },
  { name: 'segments.keyword.info.text', category: 'search', description: 'Keyword text' },

  // Asset
  { name: 'segments.asset_interaction_target.asset', category: 'asset', description: 'Asset interaction target' },
  { name: 'segments.asset_interaction_target.interaction_on_this_asset', category: 'asset', description: 'Whether interaction was on this asset' },

  // Hotel
  { name: 'segments.hotel_check_in_date', category: 'hotel', description: 'Hotel check-in date' },
  { name: 'segments.hotel_check_out_date', category: 'hotel', description: 'Hotel check-out date' },
  { name: 'segments.hotel_length_of_stay', category: 'hotel', description: 'Hotel length of stay (nights)' },
  { name: 'segments.hotel_booking_window_days', category: 'hotel', description: 'Hotel booking window in days' },
  { name: 'segments.hotel_country', category: 'hotel', description: 'Hotel country' },
  { name: 'segments.hotel_state', category: 'hotel', description: 'Hotel state' },
  { name: 'segments.hotel_city', category: 'hotel', description: 'Hotel city' },
  { name: 'segments.hotel_class', category: 'hotel', description: 'Hotel class (stars)' },
]

export const SEGMENTS_BY_CATEGORY: Record<string, GaqlSegment[]> = GAQL_SEGMENTS.reduce(
  (acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  },
  {} as Record<string, GaqlSegment[]>,
)
