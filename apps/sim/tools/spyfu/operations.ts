import type { HttpMethod } from '@/tools/types'

export interface SpyfuOperationDefinition {
  id: string
  label: string
  category: string
  description: string
  path: string
  method: HttpMethod
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
  },
  {
    id: 'domain_stats.get_latest_domain_stats',
    label: 'Get Latest Domain Stats',
    category: 'Domain Stats',
    description: 'Retrieves the most recent domain statistics snapshot.',
    path: '/apis/domain_stats_api/v2/getLatestDomainStats',
    method: 'GET',
  },
  {
    id: 'domain_stats.get_domain_stats_for_exact_date',
    label: 'Get Domain Stats For Exact Date',
    category: 'Domain Stats',
    description: 'Fetches domain metrics for the exact date you specify.',
    path: '/apis/domain_stats_api/v2/getDomainStatsForExactDate',
    method: 'GET',
  },
  {
    id: 'domain_stats.get_active_dates_for_domain',
    label: 'Get Active Dates For Domain',
    category: 'Domain Stats',
    description: 'Lists every date range that contains data for the requested domain.',
    path: '/apis/domain_stats_api/v2/getActiveDatesForDomain',
    method: 'GET',
  },
  {
    id: 'domain_stats.bulk_domain_statistics',
    label: 'Bulk Domain Statistics (Snapshot or History)',
    category: 'Domain Stats',
    description: 'Retrieves bulk statistics for multiple domains in one request.',
    path: '/apis/domain_stats_api/v2/bulkDomainStatistics',
    method: 'GET',
  },
  {
    id: 'domain_stats.find_domains_by_pattern',
    label: 'Find Domains by Pattern and Metrics',
    category: 'Domain Stats',
    description: 'Searches for domains that match a pattern and metric filters.',
    path: '/apis/domain_stats_api/v2/findDomainsByPatternAndMetrics',
    method: 'GET',
  },
  // Ad History API
  {
    id: 'ad_history.get_domain_ad_history',
    label: 'Get Domain Ad History',
    category: 'Ad History',
    description: 'Returns the historical ad copy and spend for a specific domain.',
    path: '/apis/ad_history_api/v2/getDomainAdHistory',
    method: 'GET',
  },
  {
    id: 'ad_history.get_keyword_ad_history',
    label: 'Get Keyword Ad History',
    category: 'Ad History',
    description: 'Provides historical ad details for the requested keyword.',
    path: '/apis/ad_history_api/v2/getKeywordAdHistory',
    method: 'GET',
  },
  {
    id: 'ad_history.get_keyword_ad_history_with_stats',
    label: 'Get Keyword Ad History With Stats',
    category: 'Ad History',
    description: 'Returns keyword ad history with additional engagement metrics.',
    path: '/apis/ad_history_api/v2/getKeywordAdHistoryWithStats',
    method: 'GET',
  },
  // PPC Research API (Paid SERP)
  {
    id: 'ppc_research.get_ads_for_domain',
    label: 'Get Ads for Domain',
    category: 'PPC Research',
    description: 'Retrieves paid search ads for a given domain.',
    path: '/apis/paidserp_api/v2/getPaidSerps',
    method: 'GET',
  },
  {
    id: 'ppc_research.get_most_successful_keywords',
    label: 'Get Most Successful PPC Keywords',
    category: 'PPC Research',
    description: 'Returns top performing paid keywords for a domain.',
    path: '/apis/paidserp_api/v2/getMostSuccessfulPpcKeywords',
    method: 'GET',
  },
  {
    id: 'ppc_research.get_new_ppc_keywords',
    label: 'Get New PPC Keywords',
    category: 'PPC Research',
    description: 'Finds newly added paid keywords for a domain.',
    path: '/apis/paidserp_api/v2/getNewPpcKeywords',
    method: 'GET',
  },
  // SEO Research / Organic SERP API
  {
    id: 'seo_research.get_seo_keywords',
    label: 'Get SEO Keywords',
    category: 'SEO Research',
    description: 'Returns organic keywords for the requested domain.',
    path: '/apis/organic_serp_api/v2/getSeoKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_most_valuable_keywords',
    label: 'Get Most Valuable Keywords',
    category: 'SEO Research',
    description: 'Retrieves the most valuable organic keywords for a domain.',
    path: '/apis/organic_serp_api/v2/getMostValuableKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_newly_ranked_keywords',
    label: 'Get Newly Ranked Keywords',
    category: 'SEO Research',
    description: 'Identifies keywords a domain recently started ranking for.',
    path: '/apis/organic_serp_api/v2/getNewlyRankedKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_gained_ranks_keywords',
    label: 'Get Gained Ranks Keywords',
    category: 'SEO Research',
    description: 'Lists keywords where the domain moved up in rank.',
    path: '/apis/organic_serp_api/v2/getGainedRanksKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_lost_ranks_keywords',
    label: 'Get Lost Ranks Keywords',
    category: 'SEO Research',
    description: 'Lists keywords where the domain lost ranking positions.',
    path: '/apis/organic_serp_api/v2/getLostRanksKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_gained_clicks_keywords',
    label: 'Get Gained Clicks Keywords',
    category: 'SEO Research',
    description: 'Returns keywords that gained click share for the domain.',
    path: '/apis/organic_serp_api/v2/getGainedClicksKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_lost_clicks_keywords',
    label: 'Get Lost Clicks Keywords',
    category: 'SEO Research',
    description: 'Returns keywords that lost click share for the domain.',
    path: '/apis/organic_serp_api/v2/getLostClicksKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_just_made_it_keywords',
    label: 'Get Just Made It Keywords',
    category: 'SEO Research',
    description: 'Shows keywords that just entered the first page of Google.',
    path: '/apis/organic_serp_api/v2/getJustMadeItKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_just_fell_off_keywords',
    label: 'Get Just Fell Off Keywords',
    category: 'SEO Research',
    description: 'Shows keywords that recently dropped off the first page.',
    path: '/apis/organic_serp_api/v2/getJustFellOffKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_serp_analysis_for_keyword',
    label: 'Get SERP Analysis for Keyword',
    category: 'SEO Research',
    description: 'Returns the live SERP breakdown for a keyword.',
    path: '/apis/organic_serp_api/v2/getSerpAnalysisForKeyword',
    method: 'GET',
  },
  {
    id: 'seo_research.get_where_they_outrank_you',
    label: 'Get Where They Outrank You Keywords',
    category: 'SEO Research',
    description: 'Finds keywords where a competitor outranks your domain.',
    path: '/apis/organic_serp_api/v2/getWhereTheyOutrankYouKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_where_they_surpassed_you',
    label: 'Get Where They Just Surpassed You Keywords',
    category: 'SEO Research',
    description: 'Highlights keywords where a competitor recently surpassed you.',
    path: '/apis/organic_serp_api/v2/getWhereTheyJustSurpassedYouKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_live_seo_stats',
    label: 'Get Live SEO Stats',
    category: 'SEO Research',
    description: 'Retrieves near-real-time SEO statistics for a domain.',
    path: '/apis/organic_serp_api/v2/getLiveSeoStats',
    method: 'GET',
  },
  {
    id: 'seo_research.get_highest_traffic_top_pages',
    label: 'Get Highest Traffic Top Pages',
    category: 'SEO Research',
    description: 'Lists the domain pages receiving the most organic clicks.',
    path: '/apis/top_pages_api/v2/getHighestTrafficTopPages',
    method: 'GET',
  },
  {
    id: 'seo_research.get_new_top_pages',
    label: 'Get New Top Pages',
    category: 'SEO Research',
    description: 'Shows newly ranked top pages for a domain.',
    path: '/apis/top_pages_api/v2/getNewTopPages',
    method: 'GET',
  },
  {
    id: 'seo_research.get_organic_outranking_keywords',
    label: 'Get Organic Outranking Keywords',
    category: 'SEO Research',
    description: 'Finds keywords where you outrank another domain.',
    path: '/apis/organic_serp_api/v2/getOrganicOutrankingKeywords',
    method: 'GET',
  },
  {
    id: 'seo_research.get_top_performing_pages',
    label: 'Get Top Performing Pages',
    category: 'SEO Research',
    description: 'Returns the highest performing URLs for a domain.',
    path: '/apis/top_pages_api/v2/getTopPerformingPages',
    method: 'GET',
  },
  // Competitors API
  {
    id: 'competitors.get_top_ppc_competitors',
    label: 'Get Top PPC Competitors',
    category: 'Competitors',
    description: 'Identifies the leading paid search competitors for a domain.',
    path: '/apis/competitors_api/v2/getTopPpcCompetitors',
    method: 'GET',
  },
  {
    id: 'competitors.get_top_seo_competitors',
    label: 'Get Top SEO Competitors',
    category: 'Competitors',
    description: 'Identifies the leading organic competitors for a domain.',
    path: '/apis/competitors_api/v2/getTopSeoCompetitors',
    method: 'GET',
  },
  {
    id: 'competitors.get_combined_top_competitors',
    label: 'Get Combined Top Competitors',
    category: 'Competitors',
    description: 'Returns the combined PPC + SEO competitors for a domain.',
    path: '/apis/competitors_api/v2/getCombinedTopCompetitors',
    method: 'GET',
  },
  // Kombat API
  {
    id: 'kombat.get_competing_ppc_keywords',
    label: 'Get Competing PPC Keywords',
    category: 'Kombat',
    description: 'Finds shared paid keywords between competitor domains.',
    path: '/apis/kombat_api/v2/getCompetingPpcKeywords',
    method: 'GET',
  },
  {
    id: 'kombat.get_competing_seo_keywords',
    label: 'Get Competing SEO Keywords',
    category: 'Kombat',
    description: 'Finds overlapping organic keywords between competitor domains.',
    path: '/apis/kombat_api/v2/getCompetingSeoKeywords',
    method: 'GET',
  },
  // Keyword Research API
  {
    id: 'keyword.get_related_keywords',
    label: 'Get Related Keywords',
    category: 'Keyword Research',
    description: 'Returns closely related keyword ideas.',
    path: '/apis/keyword_api/v2/getRelatedKeywords',
    method: 'GET',
  },
  {
    id: 'keyword.get_question_keywords',
    label: 'Get Question Keywords',
    category: 'Keyword Research',
    description: 'Returns question-form keyword suggestions.',
    path: '/apis/keyword_api/v2/getQuestionKeywords',
    method: 'GET',
  },
  {
    id: 'keyword.get_also_buys_ads',
    label: 'Get Also Buys Ads For Keywords',
    category: 'Keyword Research',
    description: 'Finds other advertisers buying ads on the same keywords.',
    path: '/apis/keyword_api/v2/getAlsoBuysAdsForKeywords',
    method: 'GET',
  },
  {
    id: 'keyword.get_also_ranks',
    label: 'Get Also Ranks For Keywords',
    category: 'Keyword Research',
    description: 'Finds domains that also rank for the specified keywords.',
    path: '/apis/keyword_api/v2/getAlsoRanksForKeywords',
    method: 'GET',
  },
  {
    id: 'keyword.get_transactional_keywords',
    label: 'Get Transactional Keywords',
    category: 'Keyword Research',
    description: 'Returns keywords with transactional or commercial intent.',
    path: '/apis/keyword_api/v2/getTransactionalKeywords',
    method: 'GET',
  },
  {
    id: 'keyword.get_keyword_information_bulk',
    label: 'Get Keyword Information Bulk',
    category: 'Keyword Research',
    description: 'Retrieves keyword metrics for multiple terms in a single request.',
    path: '/apis/keyword_api/v2/getKeywordInformationBulk',
    method: 'GET',
  },
  {
    id: 'keyword.post_keyword_information_bulk',
    label: 'Post Keyword Information Bulk',
    category: 'Keyword Research',
    description: 'Submits keywords for asynchronous bulk metric processing.',
    path: '/apis/keyword_api/v2/postKeywordInformationBulk',
    method: 'POST',
  },
  {
    id: 'keyword.get_keywords_all_sorts',
    label: 'Get Keywords, All Sorts',
    category: 'Keyword Research',
    description: 'Returns keyword ideas with flexible sorting and filters.',
    path: '/apis/keyword_api/v2/getKeywordsAllSorts',
    method: 'GET',
  },
  // Ranking History API
  {
    id: 'ranking_history.find_domain_rankings',
    label: 'Find domains historic rankings for a date range',
    category: 'Ranking History',
    description: 'Returns ranking history for multiple domains across a date range.',
    path: '/apis/ranking_history_api/v2/findDomainsHistoricRankingsForDateRange',
    method: 'GET',
  },
  {
    id: 'ranking_history.find_keyword_rankings',
    label: 'Find historic rankings for a keyword on domains for a date range',
    category: 'Ranking History',
    description: 'Retrieves how selected domains ranked for a keyword over time.',
    path: '/apis/ranking_history_api/v2/findHistoricRankingsForKeywordAcrossDomains',
    method: 'GET',
  },
  {
    id: 'ranking_history.find_domain_keywords_rankings',
    label: 'Find historic rankings for a domain on keywords for a date range',
    category: 'Ranking History',
    description: 'Returns how a domain ranked for a set of keywords over time.',
    path: '/apis/ranking_history_api/v2/findHistoricRankingsForDomainAcrossKeywords',
    method: 'GET',
  },
  // Account API
  {
    id: 'account.get_monthly_usage',
    label: 'API monthly usage',
    category: 'Account',
    description: 'Provides API usage totals for the current or requested month.',
    path: '/apis/account_api/v2/getApiUsageForMonth',
    method: 'GET',
  },
  {
    id: 'account.get_daily_usage',
    label: 'API daily usage',
    category: 'Account',
    description: 'Provides daily API usage totals for the authenticated account.',
    path: '/apis/account_api/v2/getApiUsageForDay',
    method: 'GET',
  },
  {
    id: 'account.get_monthly_usage_by_method',
    label: 'API monthly usage by method',
    category: 'Account',
    description: 'Breaks down API usage for the month by endpoint.',
    path: '/apis/account_api/v2/getApiUsageForMonthByMethod',
    method: 'GET',
  },
]

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

