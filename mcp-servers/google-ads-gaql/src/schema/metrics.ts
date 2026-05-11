/**
 * Google Ads GAQL Metrics
 * Reference: https://developers.google.com/google-ads/api/fields/v17/metrics
 */

import type { GaqlMetric } from './types.js'

export const GAQL_METRICS: GaqlMetric[] = [
  // Core counts
  { name: 'metrics.impressions', category: 'core', description: 'Number of ad impressions' },
  { name: 'metrics.clicks', category: 'core', description: 'Number of clicks' },
  { name: 'metrics.cost_micros', category: 'core', description: 'Cost in micros (1,000,000 micros = 1 unit of currency)', unit: 'micros' },
  { name: 'metrics.conversions', category: 'core', description: 'Number of conversions' },
  { name: 'metrics.conversions_value', category: 'core', description: 'Total conversion value (revenue)', unit: 'currency' },
  { name: 'metrics.all_conversions', category: 'core', description: 'All conversions including cross-device' },
  { name: 'metrics.all_conversions_value', category: 'core', description: 'All conversion values', unit: 'currency' },
  { name: 'metrics.view_through_conversions', category: 'core', description: 'View-through conversions' },
  { name: 'metrics.interactions', category: 'core', description: 'Total interactions' },
  { name: 'metrics.engagements', category: 'core', description: 'Total engagements' },
  { name: 'metrics.engagement_rate', category: 'core', description: 'Engagement rate', unit: 'percent' },

  // Performance / rates
  { name: 'metrics.ctr', category: 'rate', description: 'Click-through rate (clicks / impressions)', unit: 'percent' },
  { name: 'metrics.average_cpc', category: 'rate', description: 'Average cost per click', unit: 'micros' },
  { name: 'metrics.average_cpm', category: 'rate', description: 'Average cost per thousand impressions', unit: 'micros' },
  { name: 'metrics.average_cpv', category: 'rate', description: 'Average cost per video view', unit: 'micros' },
  { name: 'metrics.average_cpe', category: 'rate', description: 'Average cost per engagement', unit: 'micros' },
  { name: 'metrics.cost_per_conversion', category: 'rate', description: 'Cost per conversion', unit: 'micros' },
  { name: 'metrics.cost_per_all_conversions', category: 'rate', description: 'Cost per all conversions', unit: 'micros' },
  { name: 'metrics.value_per_conversion', category: 'rate', description: 'Value per conversion' },
  { name: 'metrics.value_per_all_conversions', category: 'rate', description: 'Value per all conversions' },
  { name: 'metrics.conversions_from_interactions_rate', category: 'rate', description: 'Conversion rate from interactions', unit: 'percent' },
  { name: 'metrics.all_conversions_from_interactions_rate', category: 'rate', description: 'All conversions rate from interactions', unit: 'percent' },

  // Bidding / target
  { name: 'metrics.absolute_top_impression_percentage', category: 'impression_share', description: 'Absolute top impression share', unit: 'percent' },
  { name: 'metrics.top_impression_percentage', category: 'impression_share', description: 'Top impression share', unit: 'percent' },
  { name: 'metrics.search_absolute_top_impression_share', category: 'impression_share', description: 'Search absolute top impression share', unit: 'percent' },
  { name: 'metrics.search_top_impression_share', category: 'impression_share', description: 'Search top impression share', unit: 'percent' },
  { name: 'metrics.search_impression_share', category: 'impression_share', description: 'Search impression share', unit: 'percent' },
  { name: 'metrics.search_budget_lost_impression_share', category: 'impression_share', description: 'Search lost IS due to budget', unit: 'percent' },
  { name: 'metrics.search_rank_lost_impression_share', category: 'impression_share', description: 'Search lost IS due to rank', unit: 'percent' },
  { name: 'metrics.content_impression_share', category: 'impression_share', description: 'Content impression share', unit: 'percent' },
  { name: 'metrics.content_budget_lost_impression_share', category: 'impression_share', description: 'Content lost IS due to budget', unit: 'percent' },
  { name: 'metrics.content_rank_lost_impression_share', category: 'impression_share', description: 'Content lost IS due to rank', unit: 'percent' },

  // Video metrics
  { name: 'metrics.video_views', category: 'video', description: 'Number of video views' },
  { name: 'metrics.video_view_rate', category: 'video', description: 'Video view rate', unit: 'percent' },
  { name: 'metrics.video_quartile_p25_rate', category: 'video', description: '25% video completion rate', unit: 'percent' },
  { name: 'metrics.video_quartile_p50_rate', category: 'video', description: '50% video completion rate', unit: 'percent' },
  { name: 'metrics.video_quartile_p75_rate', category: 'video', description: '75% video completion rate', unit: 'percent' },
  { name: 'metrics.video_quartile_p100_rate', category: 'video', description: '100% video completion rate', unit: 'percent' },

  // Quality
  { name: 'metrics.historical_quality_score', category: 'quality', description: 'Historical quality score (1-10)' },
  { name: 'metrics.historical_creative_quality_score', category: 'quality', description: 'Historical creative quality score' },
  { name: 'metrics.historical_landing_page_quality_score', category: 'quality', description: 'Historical landing page quality score' },
  { name: 'metrics.historical_search_predicted_ctr', category: 'quality', description: 'Historical search predicted CTR' },

  // Phone / call
  { name: 'metrics.phone_calls', category: 'call', description: 'Phone calls' },
  { name: 'metrics.phone_impressions', category: 'call', description: 'Phone impressions' },
  { name: 'metrics.phone_through_rate', category: 'call', description: 'Phone-through rate', unit: 'percent' },

  // Attribution
  { name: 'metrics.cross_device_conversions', category: 'attribution', description: 'Cross-device conversions' },
  { name: 'metrics.current_model_attributed_conversions', category: 'attribution', description: 'Conversions in current attribution model' },
  { name: 'metrics.current_model_attributed_conversions_value', category: 'attribution', description: 'Conversion value in current attribution model' },

  // Active view (display)
  { name: 'metrics.active_view_impressions', category: 'active_view', description: 'Active view impressions' },
  { name: 'metrics.active_view_measurability', category: 'active_view', description: 'Active view measurability', unit: 'percent' },
  { name: 'metrics.active_view_viewability', category: 'active_view', description: 'Active view viewability', unit: 'percent' },
  { name: 'metrics.active_view_cpm', category: 'active_view', description: 'Active view CPM', unit: 'micros' },
]

export const METRICS_BY_CATEGORY: Record<string, GaqlMetric[]> = GAQL_METRICS.reduce(
  (acc, m) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  },
  {} as Record<string, GaqlMetric[]>,
)
