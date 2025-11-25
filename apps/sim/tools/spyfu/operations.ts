import type { HttpMethod } from '@/tools/types'

export type SpyfuParamId = 'domain' | 'keyword' | 'date' | 'term' | 'query' | 'includeDomainsCsv' | 'isIntersection'

export interface SpyfuOperationDefinition {
  id: string
  label: string
  category: string
  description: string
  path: string
  method: HttpMethod
  requiredParams?: SpyfuParamId[]
}

export const SPYFU_BASE_URL = 'https://api.spyfu.com'

export const spyfuOperations: SpyfuOperationDefinition[] = [
  // Domain Stats API
  {
    id: 'domain_stats.get_all_domain_stats',
    label: 'Get All Domain Stats',
    category: 'Domain Stats',
    description: 'Returns domain statistics for all available historical periods.',
    path: '/apis/domain_stats_api/v2/getAllDomainStats',
    method: 'GET',
    requiredParams: ['domain'],
  },
  {
    id: 'domain_stats.get_latest_domain_stats',
    label: 'Get Latest Domain Stats',
    category: 'Domain Stats',
    description: 'Retrieves the most recent domain statistics snapshot.',
    path: '/apis/domain_stats_api/v2/getLatestDomainStats',
    method: 'GET',
    requiredParams: ['domain'],
  },
  {
    id: 'domain_stats.get_active_dates_for_domain',
    label: 'Get Active Dates For Domain',
    category: 'Domain Stats',
    description: 'Lists every date range that contains data for the requested domain.',
    path: '/apis/domain_stats_api/v2/getActiveDatesForDomain',
    method: 'GET',
    requiredParams: ['domain'],
  },
  // Ad History API
  {
    id: 'ad_history.get_domain_ad_history',
    label: 'Get Domain Ad History',
    category: 'Ad History',
    description: 'Returns the historical ad copy and spend for a specific domain.',
    path: '/apis/cloud_ad_history_api/v2/domain/getDomainAdHistory',
    method: 'GET',
    requiredParams: ['domain'],
  },
  {
    id: 'ad_history.get_keyword_ad_history',
    label: 'Get Keyword Ad History',
    category: 'Ad History',
    description: 'Provides historical ad details for the requested keyword.',
    path: '/apis/cloud_ad_history_api/v2/term/getTermAdHistory',
    method: 'GET',
    requiredParams: ['term'],
  },
  {
    id: 'ad_history.get_keyword_ad_history_with_stats',
    label: 'Get Keyword Ad History With Stats',
    category: 'Ad History',
    description: 'Returns keyword ad history with additional engagement metrics.',
    path: '/apis/cloud_ad_history_api/v2/term/getTermAdHistoryWithStats',
    method: 'GET',
    requiredParams: ['term'],
  },
  // PPC Research API (Paid SERP)
  {
    id: 'ppc_research.get_ads_for_domain',
    label: 'Get Ads for Domain',
    category: 'PPC Research',
    description: 'Retrieves paid search ads for a given domain.',
    path: '/apis/serp_api/v2/ppc/getPaidSerps',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'ppc_research.get_most_successful_keywords',
    label: 'Get Most Successful PPC Keywords',
    category: 'PPC Research',
    description: 'Returns top performing paid keywords for a domain.',
    path: '/apis/keyword_api/v2/ppc/getMostSuccessful',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'ppc_research.get_new_ppc_keywords',
    label: 'Get New PPC Keywords',
    category: 'PPC Research',
    description: 'Finds newly added paid keywords for a domain.',
    path: '/apis/keyword_api/v2/ppc/getNewKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  // SEO Research / Organic SERP API
  // {
  //   id: 'seo_research.get_seo_keywords',
  //   label: 'Get SEO Keywords',
  //   category: 'SEO Research',
  //   description: 'Returns organic keywords for the requested domain.',
  //   path: '/apis/organic_serp_api/v2/getSeoKeywords',
  //   method: 'GET',
  //   requiredParams: ['domain'],
  // },
  {
    id: 'seo_research.get_most_valuable_keywords',
    label: 'Get Most Valuable Keywords',
    category: 'SEO Research',
    description: 'Retrieves the most valuable organic keywords for a domain.',
    path: '/apis/serp_api/v2/seo/getMostValuableKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_newly_ranked_keywords',
    label: 'Get Newly Ranked Keywords',
    category: 'SEO Research',
    description: 'Identifies keywords a domain recently started ranking for.',
    path: '/apis/serp_api/v2/seo/getNewlyRankedKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_gained_ranks_keywords',
    label: 'Get Gained Ranks Keywords',
    category: 'SEO Research',
    description: 'Lists keywords where the domain moved up in rank.',
    path: '/apis/serp_api/v2/seo/getGainedRanksKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_lost_ranks_keywords',
    label: 'Get Lost Ranks Keywords',
    category: 'SEO Research',
    description: 'Lists keywords where the domain lost ranking positions.',
    path: '/apis/serp_api/v2/seo/getLostRanksKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_gained_clicks_keywords',
    label: 'Get Gained Clicks Keywords',
    category: 'SEO Research',
    description: 'Returns keywords that gained click share for the domain.',
    path: '/apis/serp_api/v2/seo/getGainedClicksKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_lost_clicks_keywords',
    label: 'Get Lost Clicks Keywords',
    category: 'SEO Research',
    description: 'Returns keywords that lost click share for the domain.',
    path: '/apis/serp_api/v2/seo/getLostClicksKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_just_made_it_keywords',
    label: 'Get Just Made It Keywords',
    category: 'SEO Research',
    description: 'Shows keywords that just entered the first page of Google.',
    path: '/apis/serp_api/v2/seo/getJustMadeItKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_just_fell_off_keywords',
    label: 'Get Just Fell Off Keywords',
    category: 'SEO Research',
    description: 'Shows keywords that recently dropped off the first page.',
    path: '/apis/serp_api/v2/seo/getJustFellOffKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_serp_analysis_for_keyword',
    label: 'Get SERP Analysis for Keyword',
    category: 'SEO Research',
    description: 'Returns the live SERP breakdown for a keyword.',
    path: '/apis/serp_api/v2/seo/getSerpAnalysisKeywords',
    method: 'GET',
    requiredParams: ['keyword'],
  },
  {
    id: 'seo_research.get_live_seo_stats',
    label: 'Get Live SEO Stats',
    category: 'SEO Research',
    description: 'Retrieves near-real-time SEO statistics for a domain.',
    path: '/apis/serp_api/v2/seo/getLiveSeoStats',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_highest_traffic_top_pages',
    label: 'Get Highest Traffic Top Pages',
    category: 'SEO Research',
    description: 'Lists the domain pages receiving the most organic clicks.',
    path: '/apis/serp_api/v2/seo/getMostTrafficTopPages',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'seo_research.get_new_top_pages',
    label: 'Get New Top Pages',
    category: 'SEO Research',
    description: 'Shows newly ranked top pages for a domain.',
    path: '/apis/serp_api/v2/seo/getNewTopPages',
    method: 'GET',
    requiredParams: ['query'],
  },
  // Competitors API
  {
    id: 'competitors.get_top_ppc_competitors',
    label: 'Get Top PPC Competitors',
    category: 'Competitors',
    description: 'Identifies the leading paid search competitors for a domain.',
    path: '/apis/competitors_api/v2/ppc/getTopCompetitors',
    method: 'GET',
    requiredParams: ['domain'],
  },
  {
    id: 'competitors.get_top_seo_competitors',
    label: 'Get Top SEO Competitors',
    category: 'Competitors',
    description: 'Identifies the leading organic competitors for a domain.',
    path: '/apis/competitors_api/v2/seo/getTopCompetitors',
    method: 'GET',
    requiredParams: ['domain'],
  },
  {
    id: 'competitors.get_combined_top_competitors',
    label: 'Get Combined Top Competitors',
    category: 'Competitors',
    description: 'Returns the combined PPC + SEO competitors for a domain.',
    path: '/apis/competitors_api/v2/combined/getCombinedTopCompetitors',
    method: 'GET',
    requiredParams: ['domain'],
  },
  // Kombat API
  {
    id: 'kombat.get_competing_ppc_competitors',
    label: 'Get Competing PPC Competitors',
    category: 'Kombat',
    description: 'Finds shared paid Competitors between competitor domains.',
    path: '/apis/keyword_api/v2/kombat/getCompetingPpcKeywords',
    method: 'GET',
    requiredParams: ['includeDomainsCsv','isIntersection'],
  },
  {
    id: 'kombat.get_competing_seo_competitors',
    label: 'Get Competing SEO Competitors',
    category: 'Kombat',
    description: 'Finds overlapping organic Competitors between competitor domains.',
    path: '/apis/keyword_api/v2/kombat/getCompetingSeoKeywords',
    method: 'GET',
    requiredParams: ['includeDomainsCsv','isIntersection'],
  },
  // Keyword Research API
  {
    id: 'keyword.get_related_keywords',
    label: 'Get Related Keywords',
    category: 'Keyword Research',
    description: 'Returns closely related keyword ideas.',
    path: '/apis/keyword_api/v2/related/getRelatedKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'keyword.get_question_keywords',
    label: 'Get Question Keywords',
    category: 'Keyword Research',
    description: 'Returns question-form keyword suggestions.',
    path: '/apis/keyword_api/v2/related/getQuestionKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'keyword.get_also_buys_ads',
    label: 'Get Also Buys Ads For Keywords',
    category: 'Keyword Research',
    description: 'Finds other advertisers buying ads on the same keywords.',
    path: '/apis/keyword_api/v2/related/getAlsoBuysAdsForKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'keyword.get_also_ranks',
    label: 'Get Also Ranks For Keywords',
    category: 'Keyword Research',
    description: 'Finds domains that also rank for the specified keywords.',
    path: '/apis/keyword_api/v2/related/getAlsoRanksForKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  {
    id: 'keyword.get_transactional_keywords',
    label: 'Get Transactional Keywords',
    category: 'Keyword Research',
    description: 'Returns keywords with transactional or commercial intent.',
    path: '/apis/keyword_api/v2/related/getTransactionKeywords',
    method: 'GET',
    requiredParams: ['query'],
  },
  // Ranking History API
  // {
  //   id: 'ranking_history.find_domain_rankings',
  //   label: 'Find domains historic rankings for a date range',
  //   category: 'Ranking History',
  //   description: 'Returns ranking history for multiple domains across a date range.',
  //   path: '/apis/organic_history_api/v2/historic/getHistoricRankingsForDomain',
  //   method: 'GET',
  //   requiredParams: ['domain'],
  // },
  // {
  //   id: 'ranking_history.find_keyword_rankings',
  //   label: 'Find historic rankings for a keyword on domains for a date range',
  //   category: 'Ranking History',
  //   description: 'Retrieves how selected domains ranked for a keyword over time.',
  //   path: '/apis/organic_history_api/v2/historic/getHistoricRankingsForKeywordOnDomains',
  //   method: 'GET',
  //   requiredParams: ['keyword','domain'],
  // },
  // {
  //   id: 'ranking_history.find_domain_keywords_rankings',
  //   label: 'Find historic rankings for a domain on keywords for a date range',
  //   category: 'Ranking History',
  //   description: 'Returns how a domain ranked for a set of keywords over time.',
  //   path: '/apis/organic_history_api/v2/historic/getHistoricRankingsForDomainOnKeywords',
  //   method: 'GET',
  //   requiredParams: ['keyword','domain'],
  // },
]

const operationIdsForParam = (param: SpyfuParamId) =>
  spyfuOperations
    .filter((operation) => operation.requiredParams?.includes(param))
    .map((operation) => operation.id)

export const spyfuDomainOperationIds = operationIdsForParam('domain')
export const spyfuKeywordOperationIds = operationIdsForParam('keyword')
export const spyfuTermOperationIds = operationIdsForParam('term')
export const spyfuDateOperationIds = operationIdsForParam('date')
export const spyfuQueryOperationIds = operationIdsForParam('query')
export const spyfuIncludeDomainsCsvOperationIds = operationIdsForParam('includeDomainsCsv')
export const spyfuIsIntersectionOperationIds = operationIdsForParam('isIntersection')
export const spyfuOperationOptions = spyfuOperations.map((operation) => ({
  id: operation.id,
  label: `${operation.category} · ${operation.label}`,
}))

export const postBodyOperationIds = spyfuOperations
  .filter((operation) => operation.method !== 'GET')
  .map((operation) => operation.id)

export const getSpyfuOperationDefinition = (
  operationId: string | undefined
): SpyfuOperationDefinition | undefined => spyfuOperations.find((operation) => operation.id === operationId)

