import type { DateRange } from './date-utils'
import type { Intent, PromptContext } from './prompt-fragments'

const COMPARISON_KEYWORDS = [
  'compare',
  'comparison',
  'vs',
  'versus',
  'week over week',
  'wow',
  'previous week',
  'prior week',
  'last week',
  'and then',
  'prior 7',
  'prior 14',
  'prior 28',
  'prior 30',
] as const

const RSA_KEYWORDS = [
  'rsa',
  'responsive search ad',
  'ad strength',
  'headlines',
  'descriptions',
] as const

const EXTENSION_KEYWORDS = [
  'extension',
  'sitelink',
  'callout',
  'structured snippet',
  'asset extension',
  'asset link',
] as const

const SEARCH_TERMS_KEYWORDS = [
  'search term',
  'search query',
  'search-term',
  'search-query',
  'sqr',
  'search-terms report',
  'str',
  'strs',
] as const

const DEMOGRAPHIC_KEYWORDS = ['gender', 'age range', 'demographic'] as const

const GEOGRAPHIC_KEYWORDS = [
  'geo',
  'geographic',
  'country',
  'city',
  'region',
  'state',
  'location performance',
] as const

const LOCATION_TARGETING_KEYWORDS = [
  'location targeting',
  'targeting settings',
  'geo target',
  'geo targeting',
] as const

const BRAND_KEYWORDS = [
  'brand vs',
  'non-brand',
  'non brand',
  'pmax',
  'brand campaign',
  'isolate brand',
  'brand so',
] as const

const AD_COPY_KEYWORDS = [
  'ad copy',
  'poor ad',
  'average ad',
  'improve ad',
  'optimize ad',
  'ad suggestion',
  'headline suggestion',
  'description suggestion',
  'keyword-aligned',
] as const

// ============================================
// NEW INTENTS - mapped to user's full prompts list
// ============================================

const WASTED_TERMS_KEYWORDS = [
  'wasted spend',
  'wasted query',
  'zero conversion',
  'zero conv',
  'no conversion',
  'low conversion',
  "don't match intent",
  "doesn't match intent",
  'irrelevant search',
  'irrelevant queries',
  'negative keyword',
  'add negative',
  'negate',
  'symmetric negative',
  'phrase match recommendation',
  'exact match recommendation',
  'high-impression, zero',
  'high impression zero',
] as const

const KEYWORD_EXPANSION_KEYWORDS = [
  'new keyword',
  'add keyword',
  'keyword idea',
  'keyword expansion',
  'expand keyword',
  'top converters',
  'top converting search terms',
  'propose keyword',
  'suggest keyword',
  'keyword suggestion',
] as const

const PAUSE_OR_CUT_KEYWORDS = [
  'pause campaign',
  'cut budget',
  'reduce budget',
  'low roas',
  'roas <',
  'roas below',
  'roas under',
  'underperforming campaign',
  'losing money',
  'wasted budget',
  'spending more than',
  'recommend pause',
] as const

const SCALE_KEYWORDS = [
  'scale',
  'increase budget',
  'budget increase',
  'budget headroom',
  'safe to scale',
  '20–30%',
  '20-30%',
  'expand budget',
  'incremental revenue',
] as const

const PACING_KEYWORDS = [
  'pacing',
  'spend pace',
  'budget pace',
  'on track',
  'burn rate',
  'expected budget',
  'monthly budget',
] as const

const CONVERSION_TRACKING_KEYWORDS = [
  'conversion tracking',
  'conv tracking',
  'tracking gap',
  'no conversion signal',
  'conversion signal',
  'tracking working',
  'tracking healthy',
  '<10 conv',
  'conversion gap',
] as const

const AD_REJECTION_KEYWORDS = [
  'ad rejection',
  'disapproved',
  'rejected ad',
  'policy violation',
  'ads delivering',
  'ad approval',
  'ad disapproval',
] as const

const PLACEMENT_KEYWORDS = [
  'placement',
  'where my ads',
  'where are my ads',
  'detail placement',
  'website placement',
  'display placement',
  'video placement',
  'pmax placement',
] as const

const FINAL_URL_KEYWORDS = [
  'final url',
  'final urls',
  'broken url',
  'landing url',
  'destination url',
  'url not working',
  'urls active',
  'main domain',
  'domain match',
] as const

const SITELINK_PERF_KEYWORDS = [
  'sitelink performance',
  'sitelink conversion',
  'best sitelink',
  'top sitelink',
  'sitelink with',
  'highest conversion sitelink',
  'sitelinks with the highest',
] as const

const DEVICE_KEYWORDS = [
  'device',
  'device-wise',
  'mobile vs',
  'desktop vs',
  'tablet vs',
  'by device',
] as const

const AUDIENCE_KEYWORDS = [
  'audience',
  'audience segment',
  'audience performance',
  'best audience',
  'remarketing audience',
  'in-market audience',
  'affinity audience',
] as const

const ASSET_DISTRIBUTION_KEYWORDS = [
  'asset impression',
  'asset distribution',
  'creative exposure',
  'creative impression',
  'asset getting',
  'enough exposure',
  'impressions for different assets',
  'how my impressions are distributed',
] as const

const FULL_AUDIT_KEYWORDS = [
  'full audit',
  'account audit',
  'audit all',
  'top 5 issues',
  'top issues',
  'flag the top',
  'estimated $ impact',
  'roas uplift',
  'ranked by',
] as const

const IS_AUDIT_KEYWORDS = [
  'impression share',
  'is lost',
  'is to budget',
  'is to rank',
  'impression share lost',
  'budget vs rank',
  'is lost to',
] as const

const QS_AUDIT_KEYWORDS = [
  'quality score',
  'qs underperformer',
  'qs-weighted',
  'qs weighted',
  'low quality score',
  'underperforming keywords',
] as const

const OPPORTUNITIES_KEYWORDS = [
  'optimization opportunit',
  'top 10 optimization',
  'biggest lever',
  'ranked by estimated',
  'ranked by $',
  'estimated lift',
  'top opportunit',
] as const

export interface DetectedIntents {
  intents: Intent[]
  promptContext: PromptContext
}

function anyMatch(lower: string, list: readonly string[]): boolean {
  return list.some((keyword) => lower.includes(keyword))
}

export function detectIntents(userInput: string, dateRanges: DateRange[]): DetectedIntents {
  const lower = userInput.toLowerCase()
  const intents = new Set<Intent>()
  const promptContext: PromptContext = {}

  const hasComparisonKeywords = anyMatch(lower, COMPARISON_KEYWORDS)

  if (dateRanges.length === 2 || hasComparisonKeywords) {
    intents.add('comparison')

    if (dateRanges.length === 2) {
      promptContext.comparison = {
        comparison: dateRanges[0],
        main: dateRanges[1],
      }
    }
  }

  if (anyMatch(lower, RSA_KEYWORDS)) intents.add('rsa')
  if (anyMatch(lower, EXTENSION_KEYWORDS)) intents.add('extensions')
  if (anyMatch(lower, SEARCH_TERMS_KEYWORDS)) intents.add('search_terms')
  if (anyMatch(lower, DEMOGRAPHIC_KEYWORDS)) intents.add('demographics')
  if (anyMatch(lower, GEOGRAPHIC_KEYWORDS)) intents.add('geographic')
  if (anyMatch(lower, LOCATION_TARGETING_KEYWORDS)) intents.add('location_targeting')
  if (anyMatch(lower, BRAND_KEYWORDS)) intents.add('brand_vs_nonbrand')
  if (anyMatch(lower, AD_COPY_KEYWORDS)) intents.add('ad_copy_optimization')

  // New intents
  if (anyMatch(lower, WASTED_TERMS_KEYWORDS)) {
    intents.add('wasted_search_terms')
    intents.add('search_terms')
  }
  if (anyMatch(lower, KEYWORD_EXPANSION_KEYWORDS)) intents.add('keyword_expansion')
  if (anyMatch(lower, PAUSE_OR_CUT_KEYWORDS)) intents.add('pause_or_cut')
  if (anyMatch(lower, SCALE_KEYWORDS)) intents.add('scale_budget')
  if (anyMatch(lower, PACING_KEYWORDS)) intents.add('pacing')
  if (anyMatch(lower, CONVERSION_TRACKING_KEYWORDS)) intents.add('conversion_tracking')
  if (anyMatch(lower, AD_REJECTION_KEYWORDS)) intents.add('ad_rejections')
  if (anyMatch(lower, PLACEMENT_KEYWORDS)) intents.add('placements')
  if (anyMatch(lower, FINAL_URL_KEYWORDS)) intents.add('final_urls')
  if (anyMatch(lower, SITELINK_PERF_KEYWORDS)) {
    intents.add('sitelinks_performance')
    intents.add('extensions')
  }
  if (anyMatch(lower, DEVICE_KEYWORDS)) intents.add('device')
  if (anyMatch(lower, AUDIENCE_KEYWORDS)) intents.add('audience')
  if (anyMatch(lower, ASSET_DISTRIBUTION_KEYWORDS)) intents.add('asset_distribution')
  if (anyMatch(lower, FULL_AUDIT_KEYWORDS)) intents.add('full_audit')
  if (anyMatch(lower, IS_AUDIT_KEYWORDS)) intents.add('impression_share_audit')
  if (anyMatch(lower, QS_AUDIT_KEYWORDS)) intents.add('quality_score_audit')
  if (anyMatch(lower, OPPORTUNITIES_KEYWORDS)) intents.add('opportunities')

  return {
    intents: Array.from(intents),
    promptContext,
  }
}
