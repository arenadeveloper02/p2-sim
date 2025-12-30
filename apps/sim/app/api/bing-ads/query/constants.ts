// Microsoft Advertising API endpoints
export const BING_ADS_API_URL = 'https://bingads.microsoft.com/Reporting/v13'
export const BING_ADS_OAUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

// Position2 Inc. Customer ID
export const POSITION2_CUSTOMER_ID = 'C000736328'

export const BING_ADS_DEFAULT_CUSTOMER_ID = '12187584'

// Default date range in days
export const DEFAULT_DATE_RANGE_DAYS = 7

// Bing Ads accounts mapping
export const BING_ADS_ACCOUNTS: Record<string, { id: string; name: string; customerId?: string }> = {
  position2_inc: { id: 'C000736328', name: 'Position2 Inc.' },
  '247insider': { id: 'F113ZL2Q', name: '247Insider.com' },
  absolute_software: { id: 'X7721510', name: 'Absolute Software' },
  altula: { id: 'X7854216', name: 'Altula' },
  amazon_b2b: { id: 'B011MVGU', name: 'Amazon B2B' },
  amazon_web_services: { id: 'B010UE8C', name: 'Amazon Web Services' },
  antivirusreviews: { id: 'F120FMNQ', name: 'AntiVirusReviews.com' },
  autoarena: { id: 'F119PZDA', name: 'AutoArena.com' },
  bargain_net: { id: 'F120JYA3', name: 'Bargain.net' },
  beauterre: { id: 'F143RVD7', name: 'Beauterre' },
  big_g_creative: { id: 'F142Q248', name: 'Big G Creative' },
  bingelocal: { id: 'F120VDGC', name: 'BingeLocal.net' },
  blackfridaystreet: { id: 'F118RML5', name: 'BlackFridayStreet.com' },
  blackfriyay: { id: 'F119W1DJ', name: 'BlackFriyay.com' },
  botmetric: { id: 'B041R11F', name: 'Botmetric' },
  businessbytes: { id: 'F118NT2T', name: 'BusinessBytes.net' },
  capitalcitynurses: { id: 'F120K5EG', name: 'CapitalCityNurses.com' },
  careadvantage: { id: 'F120L8EF', name: 'CareAdvantage' },
  cellphones_guru: { id: 'F120QC4N', name: 'Cellphones.Guru Bing' },
  comfort_soul: { id: 'F1196AW7', name: 'Comfort Soul' },
  cutting_edge_firewood: { id: 'F120JLPM', name: 'Cutting Edge Firewood' },
  cybermondaypicks: { id: 'F119JS7T', name: 'CyberMondayPicks.com' },
  dealsdivine: { id: 'F119T3ZT', name: 'DealsDivine.com' },
  dealsfarms: { id: 'F119FJLP', name: 'DealsFarms.com' },
  discoverlocal: { id: 'F120QD4Q', name: 'DiscoverLocal.net' },
  factuia: { id: 'F113ZYXE', name: 'Factuia.com' },
  findanswerstoday: { id: 'F119YZNS', name: 'FindAnswersToday.com' },
  gentle_dental: { id: '1510008200', name: 'Gentle Dental' },
  healthatoz: { id: 'F118679G', name: 'HealthAtoZ.net Bing' },
  hunter_fans: { id: 'F120FD4H', name: 'Hunter Fans' },
  infosavant: { id: 'F113NE34', name: 'InfoSavant.net' },
  karrot: { id: 'B017TFLL', name: 'Karrot' },
  kitchenaid: { id: 'F108SUNH', name: 'KitchenAid' },
  knownemo: { id: 'F119EYGD', name: 'KnowNemo.com' },
  localwizard: { id: 'F120MKTP', name: 'Localwizard.net' },
  mobilesarena: { id: 'F118791H', name: 'MobilesArena.com' },
  offerspod: { id: 'F119BMSP', name: 'OffersPod.com' },
  position2mcc: { id: 'X7420892', name: 'position2mcc' },
  power_wizard: { id: 'F149WSPC', name: 'Power Wizard' },
  quorumlabs: { id: 'X0411997', name: 'QuorumLabs, Inc' },
  reciprocity: { id: 'F132WPW3', name: 'Reciprocity Inc.' },
  resultsbee: { id: 'F120SGQF', name: 'Resultsbee.com' },
  rheem_commercial: { id: 'F120MPUQ', name: 'Rheem Commercial-Water' },
  richrelevance: { id: 'F142WJ32', name: 'RichRelevance' },
  ruckus: { id: 'F1209U1D', name: 'Ruckus' },
  sandstone_diagnostics: { id: 'F108DPJE', name: 'Sandstone Diagnostics' },
  seasondeals: { id: 'F1203CJ7', name: 'seasondeals.store' },
  seeknemo_uk: { id: 'F119ZUAP', name: 'SeekNemo.com - UK' },
  au_eventgroove: { id: '2764923', name: 'AU - Eventgroove Products', customerId: '6716' },
}

// Available report columns for different report types
export const CAMPAIGN_PERFORMANCE_COLUMNS = [
  'AccountName',
  'AccountId',
  'CampaignName',
  'CampaignId',
  'CampaignStatus',
  'Impressions',
  'Clicks',
  'Spend',
  'Conversions',
  'Revenue',
  'Ctr',
  'AverageCpc',
  'CostPerConversion',
  'ConversionRate',
  'ImpressionSharePercent',
  'TimePeriod',
]

export const ADGROUP_PERFORMANCE_COLUMNS = [
  'AccountName',
  'AccountId',
  'CampaignName',
  'CampaignId',
  'AdGroupName',
  'AdGroupId',
  'AdGroupStatus',
  'Impressions',
  'Clicks',
  'Spend',
  'Conversions',
  'Revenue',
  'Ctr',
  'AverageCpc',
  'CostPerConversion',
  'ConversionRate',
  'TimePeriod',
]

export const KEYWORD_PERFORMANCE_COLUMNS = [
  'AccountName',
  'AccountId',
  'CampaignName',
  'CampaignId',
  'AdGroupName',
  'AdGroupId',
  'Keyword',
  'KeywordId',
  'KeywordStatus',
  'Impressions',
  'Clicks',
  'Spend',
  'Conversions',
  'Revenue',
  'Ctr',
  'AverageCpc',
  'CostPerConversion',
  'QualityScore',
  'TimePeriod',
]

// Date presets for Bing Ads reporting
export const DATE_PRESETS = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'LastSevenDays',
  last_14_days: 'LastFourteenDays',
  last_30_days: 'LastThirtyDays',
  this_week: 'ThisWeek',
  last_week: 'LastWeek',
  this_month: 'ThisMonth',
  last_month: 'LastMonth',
  this_year: 'ThisYear',
  last_year: 'LastYear',
}

export function getBingAccountId(accountKey: string): string {
  const account = BING_ADS_ACCOUNTS[accountKey]
  if (!account) {
    throw new Error(`Unknown Bing Ads account: ${accountKey}`)
  }
  return account.id
}

export function getBingAccountName(accountKey: string): string {
  const account = BING_ADS_ACCOUNTS[accountKey]
  if (!account) {
    throw new Error(`Unknown Bing Ads account: ${accountKey}`)
  }
  return account.name
}
