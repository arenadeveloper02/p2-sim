import type { Intent, PromptContext } from './types'

const CAMPAIGN_LIST_KEYWORDS = [
  'list campaigns',
  'show campaigns',
  'all campaigns',
  'campaign list',
  'what campaigns',
] as const

const PERFORMANCE_KEYWORDS = [
  'performance',
  'metrics',
  'results',
  'spend',
  'impressions',
  'clicks',
  'conversions',
  'ctr',
  'cpc',
  'roas',
] as const

const DEMOGRAPHIC_KEYWORDS = [
  'demographic',
  'age',
  'gender',
  'audience',
  'age range',
  'age group',
] as const

const CREATIVE_KEYWORDS = [
  'creative',
  'ad creative',
  'ad copy',
  'image',
  'video',
  'headline',
  'description',
] as const

const PLACEMENT_KEYWORDS = [
  'placement',
  'publisher',
  'platform',
  'facebook',
  'instagram',
  'messenger',
  'audience network',
] as const

const DEVICE_KEYWORDS = ['device', 'mobile', 'desktop', 'tablet'] as const

const ADSET_KEYWORDS = ['ad set', 'adset', 'ad sets', 'adsets'] as const

const AD_KEYWORDS = ['ads', 'ad performance', 'individual ads'] as const

export interface DetectedIntents {
  intents: Intent[]
  promptContext: PromptContext
}

export function detectIntents(userInput: string): DetectedIntents {
  const lower = userInput.toLowerCase()
  const intents = new Set<Intent>()
  const promptContext: PromptContext = {}

  // Detect campaign list intent
  if (CAMPAIGN_LIST_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('campaign_list')
  }

  // Detect performance intent
  if (PERFORMANCE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('performance')
  }

  // Detect demographic intent
  if (DEMOGRAPHIC_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('demographics')
  }

  // Detect creative intent
  if (CREATIVE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('creative')
  }

  // Detect placement intent
  if (PLACEMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('placement')
  }

  // Detect device intent
  if (DEVICE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('device')
  }

  // Detect adset intent
  if (ADSET_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('adset')
  }

  // Detect ad intent
  if (AD_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    intents.add('ad')
  }

  return {
    intents: Array.from(intents),
    promptContext,
  }
}
