import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { executeProviderRequest } from '@/providers'
import { buildSystemPrompt } from './prompt-fragments'
import { detectIntents } from './intent-detector'
import { resolveProvider } from './ai-provider'
import { parseAiResponse } from './ai-response'

const logger = createLogger('GoogleAdsAPI')

// Google Ads accounts configuration - matching Python script
const GOOGLE_ADS_ACCOUNTS: Record<string, { id: string; name: string }> = {
  ami: { id: '7284380454', name: 'AMI' },
  heartland: { id: '4479015711', name: 'Heartland' },
  nhi: { id: '2998186794', name: 'NHI' },
  oic_culpeper: { id: '8226685899', name: 'OIC-Culpeper' },
  odc_al: { id: '1749359003', name: 'ODC-AL' },
  cpic: { id: '1757492986', name: 'CPIC' },
  idi_fl: { id: '1890773395', name: 'IDI-FL' },
  smi: { id: '9960845284', name: 'SMI' },
  holmdel_nj: { id: '3507263995', name: 'Holmdel-NJ' },
  ft_jesse: { id: '4443836419', name: 'Ft. Jesse' },
  ud: { id: '8270553905', name: 'UD' },
  wolf_river: { id: '6445143850', name: 'Wolf River' },
  phoenix_rehab: { id: '4723354550', name: 'Phoenix Rehab (NEW - WM Invoices)' },
  au_eventgroove_products: { id: '3365918329', name: 'AU - Eventgroove Products' },
  us_eventgroove_products: { id: '4687328820', name: 'US - Eventgroove Products' },
  ca_eventgroove_products: { id: '5197514377', name: 'CA - Eventgroove Products' },
  perforated_paper: { id: '8909188371', name: 'Perforated Paper' },
  uk_eventgroove_products: { id: '7662673578', name: 'UK - Eventgroove Products' },
  monster_transmission: { id: '2680354698', name: 'Monster Transmission' },
  careadvantage: { id: '9059182052', name: 'CareAdvantage' },
  capitalcitynurses: { id: '8395621144', name: 'CapitalCityNurses.com' },
  silverlininghealthcare: { id: '4042307092', name: 'Silverlininghealthcare.com' },
  youngshc: { id: '3240333229', name: 'Youngshc.com' },
  nova_hhc: { id: '9279793056', name: 'Nova HHC' },
  inspire_aesthetics: { id: '1887900641', name: 'Inspire Aesthetics' },
  mosca_plastic_surgery: { id: '8687457378', name: 'Mosca Plastic Surgery' },
  marietta_plastic_surgery: { id: '6374556990', name: 'Marietta Plastic Surgery' },
  daniel_shapiro: { id: '7395576762', name: 'Daniel I. Shapiro, M.D., P.C.' },
  southern_coastal: { id: '2048733325', name: 'Southern Coastal' },
  plastic_surgery_center_hr: { id: '1105892184', name: 'Plastic Surgery Center of Hampton Roads' },
  epstein: { id: '1300586568', name: 'EPSTEIN' },
  covalent_metrology: { id: '3548685960', name: 'Covalent Metrology' },
  gentle_dental: { id: '2497090182', name: 'Gentle Dental' },
  great_hill_dental: { id: '6480839212', name: 'Great Hill Dental' },
  dynamic_dental: { id: '4734954125', name: 'Dynamic Dental' },
  great_lakes: { id: '9925296449', name: 'Great Lakes' },
  southern_ct_dental: { id: '7842729643', name: 'Southern Connecticut Dental Group' },
  dental_care_associates: { id: '2771541197', name: 'Dental Care Associates' },
  service_air_eastern_shore: { id: '8139983849', name: 'Service Air Eastern Shore' },
  chancey_reynolds: { id: '7098393346', name: 'Chancey & Reynolds' },
  howell_chase: { id: '1890712343', name: 'Howell Chase' },
}

// Position2 Manager MCC for login
const POSITION2_MANAGER = '4455285084'

interface GoogleAdsRequest {
  query: string
  accounts: string
  period_type?: string
  output_format?: string
  sort_by?: string
  custom_start_date?: string
  custom_end_date?: string
}

interface Campaign {
  name: string
  status: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  avg_cpc: number
  cost_per_conversion: number
  conversion_rate: number
  impression_share: number
  budget_lost_share: number
  rank_lost_share: number
  roas: number
}

interface AccountResult {
  account_id: string
  account_name: string
  campaigns: Campaign[]
  result: any[]
  gaqlQuery: string
  total_campaigns: number
  account_totals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
    conversions_value: number
    ctr: number
    avg_cpc: number
    conversion_rate: number
    cost_per_conversion: number
  }
  error?: string
}

async function generateSmartGAQL(
  userQuestion: string,
  accountName: string
): Promise<{
  gaqlQuery: string
  periodType: string
  queryType: string
  startDate: string
  endDate: string
  isComparison?: boolean
  comparisonQuery?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
}> {
  logger.info('Generating complete GAQL query with AI', { userQuestion, accountName })

  try {
    // Use AI to generate complete GAQL query directly
    const aiResult = await generateGAQLWithAI(userQuestion)
    logger.info('AI GAQL generation successful', {
      queryType: aiResult.queryType,
      periodType: aiResult.periodType,
      startDate: aiResult.startDate,
      endDate: aiResult.endDate,
      gaqlLength: aiResult.gaqlQuery.length,
      isComparison: aiResult.isComparison,
    })

    return {
      gaqlQuery: aiResult.gaqlQuery,
      queryType: aiResult.queryType,
      periodType: aiResult.periodType,
      startDate: aiResult.startDate,
      endDate: aiResult.endDate,
      isComparison: aiResult.isComparison,
      comparisonQuery: aiResult.comparisonQuery,
      comparisonStartDate: aiResult.comparisonStartDate,
      comparisonEndDate: aiResult.comparisonEndDate,
    }
  } catch (error) {
    logger.error('AI GAQL generation failed', { error, userQuestion, accountName })
    throw new Error(`Failed to generate GAQL query: ${error}`)
  }
}

// Helper function to extract date ranges from user input
function extractDateRanges(input: string): Array<{ start: string; end: string }> {
  const dateRanges: Array<{ start: string; end: string }> = []
  const lower = input.toLowerCase()

  // Check for "this week" or "current week" - calculate dates immediately
  if (lower.includes('this week') || lower.includes('current week')) {
    const today = new Date()
    const currentDay = today.getDay()
    // Calculate Monday of current week (0 = Sunday, 1 = Monday, etc.)
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
    const startDate = new Date(today)
    startDate.setDate(today.getDate() + mondayOffset)
    // End date is yesterday (Google Ads data is typically 1 day behind)
    const endDate = new Date(today)
    endDate.setDate(today.getDate() - 1)

    dateRanges.push({
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    })

    logger.info('Extracted "this week" date range', {
      start: dateRanges[0].start,
      end: dateRanges[0].end,
    })
    return dateRanges
  }

  // Check for "last week" - calculate dates immediately
  if (lower.includes('last week')) {
    const today = new Date()
    // Calculate last Sunday
    const daysToLastSunday = today.getDay() === 0 ? 7 : today.getDay()
    const lastWeekEnd = new Date(today)
    lastWeekEnd.setDate(today.getDate() - daysToLastSunday)
    const endDate = lastWeekEnd
    // Calculate Monday of last week
    const startDate = new Date(lastWeekEnd)
    startDate.setDate(lastWeekEnd.getDate() - 6)

    dateRanges.push({
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    })

    logger.info('Extracted "last week" date range', {
      start: dateRanges[0].start,
      end: dateRanges[0].end,
    })
    return dateRanges
  }

  // First, try to match numeric format with "and then": "10/8/2025 to 10/14/2025 and then 10/15/2025 to 10/21/2025"
  const numericFullPattern =
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+and\s+then\s+)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+)(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  const numericFullMatch = input.match(numericFullPattern)

  if (numericFullMatch) {
    // First range
    const month1 = numericFullMatch[1].padStart(2, '0')
    const day1 = numericFullMatch[2].padStart(2, '0')
    const year1 = numericFullMatch[3]
    const month2 = numericFullMatch[4].padStart(2, '0')
    const day2 = numericFullMatch[5].padStart(2, '0')
    const year2 = numericFullMatch[6]
    dateRanges.push({
      start: `${year1}-${month1}-${day1}`,
      end: `${year2}-${month2}-${day2}`,
    })

    // Second range
    const month3 = numericFullMatch[7].padStart(2, '0')
    const day3 = numericFullMatch[8].padStart(2, '0')
    const year3 = numericFullMatch[9]
    const month4 = numericFullMatch[10].padStart(2, '0')
    const day4 = numericFullMatch[11].padStart(2, '0')
    const year4 = numericFullMatch[12]
    dateRanges.push({
      start: `${year3}-${month3}-${day3}`,
      end: `${year4}-${month4}-${day4}`,
    })

    logger.info('Extracted numeric date ranges with "and then"', { dateRanges })
    return dateRanges
  }

  // Second, try to match the month name pattern with "and then": "Sept 8 to 14 2025 and then 15 to 21 2025"
  const fullPattern =
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\s+to\s+(\d{1,2})\s+(\d{4})(?:\s+and\s+then\s+|\s+and\s+)(\d{1,2})\s+to\s+(\d{1,2})\s+(\d{4})/i
  const fullMatch = input.match(fullPattern)

  if (fullMatch) {
    // Extract month from the beginning
    const monthStr = fullMatch[0].match(/^[A-Za-z]+/)?.[0] || ''
    const monthMap: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    }
    const month = monthMap[monthStr.toLowerCase()] || '09'

    // First range
    const start1 = fullMatch[1].padStart(2, '0')
    const end1 = fullMatch[2].padStart(2, '0')
    const year1 = fullMatch[3]
    dateRanges.push({
      start: `${year1}-${month}-${start1}`,
      end: `${year1}-${month}-${end1}`,
    })

    // Second range (same month)
    const start2 = fullMatch[4].padStart(2, '0')
    const end2 = fullMatch[5].padStart(2, '0')
    const year2 = fullMatch[6]
    dateRanges.push({
      start: `${year2}-${month}-${start2}`,
      end: `${year2}-${month}-${end2}`,
    })

    return dateRanges
  }

  // Fallback to individual patterns
  const patterns = [
    // Month name patterns: "Sept 8 to 14 2025" or "September 8-14, 2025"
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s+to\s+|-|–)(\d{1,2})(?:,?\s+)?(\d{4})/gi,
    // Numeric patterns: "9/8 to 9/14 2025" or "9/8/2025 to 9/14/2025"
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+|-|–)(\d{1,2})\/(\d{1,2})\/(\d{4})/gi,
    // ISO format: "2025-09-08 to 2025-09-14"
    /(\d{4})-(\d{2})-(\d{2})(?:\s+to\s+|-|–)(\d{4})-(\d{2})-(\d{2})/gi,
  ]

  for (const pattern of patterns) {
    const matches = [...input.matchAll(pattern)]
    for (const match of matches) {
      try {
        let startDate: string
        let endDate: string

        if (match[0].includes('/')) {
          // Numeric format: M/D/YYYY
          const month1 = match[1].padStart(2, '0')
          const day1 = match[2].padStart(2, '0')
          const year1 = match[3]
          const month2 = match[4].padStart(2, '0')
          const day2 = match[5].padStart(2, '0')
          const year2 = match[6]
          startDate = `${year1}-${month1}-${day1}`
          endDate = `${year2}-${month2}-${day2}`
        } else if (match[0].match(/^\d{4}-\d{2}-\d{2}/)) {
          // ISO format
          startDate = `${match[1]}-${match[2]}-${match[3]}`
          endDate = `${match[4]}-${match[5]}-${match[6]}`
        } else {
          // Month name format: "Sept 8 to 14 2025"
          const monthStr = match[0].match(/^[A-Za-z]+/)?.[0] || ''
          const monthMap: Record<string, string> = {
            jan: '01',
            january: '01',
            feb: '02',
            february: '02',
            mar: '03',
            march: '03',
            apr: '04',
            april: '04',
            may: '05',
            jun: '06',
            june: '06',
            jul: '07',
            july: '07',
            aug: '08',
            august: '08',
            sep: '09',
            sept: '09',
            september: '09',
            oct: '10',
            october: '10',
            nov: '11',
            november: '11',
            dec: '12',
            december: '12',
          }
          const month = monthMap[monthStr.toLowerCase()] || '01'
          const day1 = match[1].padStart(2, '0')
          const day2 = match[2].padStart(2, '0')
          const year = match[3]
          startDate = `${year}-${month}-${day1}`
          endDate = `${year}-${month}-${day2}`
        }

        dateRanges.push({ start: startDate, end: endDate })
      } catch (e) {
        logger.warn('Failed to parse date range', { match: match[0], error: e })
      }
    }
  }

  return dateRanges
}

async function generateGAQLWithAI(userInput: string): Promise<{
  gaqlQuery: string
  queryType: string
  periodType: string
  startDate: string
  endDate: string
  isComparison?: boolean
  comparisonQuery?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
}> {
  logger.info('Generating complete GAQL query with AI', { userInput })

  // Step 1: Extract date ranges from user input
  const dateRanges = extractDateRanges(userInput)
  logger.info('Extracted date ranges from user input', {
    userInput,
    dateRangesFound: dateRanges.length,
    dateRanges,
  })

  // Step 2: Detect query intents and comparison context
  const { intents, promptContext } = detectIntents(userInput, dateRanges)
  
  // If we extracted a single date range (e.g., "this week"), add it to prompt context
  if (dateRanges.length === 1 && !promptContext.comparison) {
    promptContext.dateRange = dateRanges[0]
  }
  
  logger.info('Detected query intents', { intents, hasComparisonContext: !!promptContext.comparison, hasDateRange: !!promptContext.dateRange })

  if (promptContext.comparison) {
    logger.info('Comparison mode activated', {
      mainPeriod: `${promptContext.comparison.main.start} to ${promptContext.comparison.main.end}`,
      comparisonPeriod: `${promptContext.comparison.comparison.start} to ${promptContext.comparison.comparison.end}`,
    })
  }

  const systemPrompt = buildSystemPrompt(intents, promptContext)
  const modifiedInput = userInput

  logger.debug('Constructed system prompt for GAQL generation', {
    promptLength: systemPrompt.length,
    intentsIncluded: intents,
  })

  const comparisonExample = promptContext.comparison
    ? `Example with detected ranges (${promptContext.comparison.comparison.start} to ${promptContext.comparison.comparison.end} vs ${promptContext.comparison.main.start} to ${promptContext.comparison.main.end}):
{
  "gaql_query": "SELECT ... WHERE segments.date BETWEEN '${promptContext.comparison.main.start}' AND '${promptContext.comparison.main.end}' ...",
  "comparison_query": "SELECT ... WHERE segments.date BETWEEN '${promptContext.comparison.comparison.start}' AND '${promptContext.comparison.comparison.end}' ...",
  "is_comparison": true,
  "start_date": "${promptContext.comparison.main.start}",
  "end_date": "${promptContext.comparison.main.end}",
  "comparison_start_date": "${promptContext.comparison.comparison.start}",
  "comparison_end_date": "${promptContext.comparison.comparison.end}"
}`
    : `Example for "Sept 8-14 and then 15-21":
{
  "gaql_query": "SELECT ... WHERE segments.date BETWEEN '2025-09-15' AND '2025-09-21' ...",
  "is_comparison": true,
  "comparison_query": "SELECT ... WHERE segments.date BETWEEN '2025-09-08' AND '2025-09-14' ...",
  "comparison_start_date": "2025-09-08",
  "comparison_end_date": "2025-09-14",
  "start_date": "2025-09-15",
  "end_date": "2025-09-21"
}`

  const responseInstructions = [
    'Respond with EXACTLY ONE valid JSON object. No additional text, no multiple JSON objects, no explanations.',
    'CRITICAL: If the user\'s question contains TWO date ranges or words like "and then", "compare", "vs", "previous week", you MUST:',
    '1. Set "is_comparison": true',
    '2. Provide "comparison_query" with the FIRST date range',
    '3. Provide "comparison_start_date" and "comparison_end_date" for the FIRST date range',
    '4. The main "gaql_query" should use the SECOND date range',
    comparisonExample,
  ].join('\n')

  const fullSystemPrompt = `${systemPrompt}\n\n${responseInstructions}`


  try {
    const { provider, model, apiKey } = resolveProvider(logger)

    logger.info('Making AI request for query parsing', {
      provider,
      model,
      hasApiKey: !!apiKey,
    })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: fullSystemPrompt,
      context: `Parse this Google Ads question: "${modifiedInput}"`,
      messages: [
        {
          role: 'user',
          content: `Parse this Google Ads question: "${modifiedInput}"`,
        },
      ],
      apiKey,
      temperature: 0.0, // Set to 0 for completely deterministic query generation
      maxTokens: provider === 'anthropic' ? 8192 : provider === 'xai' ? 16000 : 16000, // Claude: 8,192, Grok: 16,000, GPT-4o: 16,384
    })

    const parsed = parseAiResponse(aiResponse, userInput, logger)

    return {
      gaqlQuery: parsed.gaqlQuery,
      queryType: parsed.queryType || 'campaigns',
      periodType: parsed.periodType || 'last_30_days',
      startDate:
        parsed.startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: parsed.endDate || new Date().toISOString().split('T')[0],
      isComparison: parsed.isComparison || false,
      comparisonQuery: parsed.comparisonQuery,
      comparisonStartDate: parsed.comparisonStartDate,
      comparisonEndDate: parsed.comparisonEndDate,
    }
  } catch (error) {
    logger.error('AI query parsing failed, using manual fallback', { error })
    throw error // Let the calling function handle the fallback
  }
}

function calculateDynamicDates(periodType: string): { startDate: string; endDate: string } {
  const today = new Date()
  let startDate: Date
  let endDate: Date

  switch (periodType) {
    case 'today':
      startDate = new Date(today)
      endDate = new Date(today)
      break
    case 'yesterday':
      startDate = new Date(today)
      startDate.setDate(today.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'last_7_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 6)
      break
    case 'last_15_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 14)
      break
    case 'last_30_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1) // Yesterday
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 29) // 30 days total
      break
    case 'this_week': {
      // Start of current week (Monday)
      const currentDay = today.getDay()
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
      startDate = new Date(today)
      startDate.setDate(today.getDate() + mondayOffset)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    }
    case 'last_week': {
      // Previous week (Monday to Sunday)
      const lastWeekEnd = new Date(today)
      const daysToLastSunday = today.getDay() === 0 ? 7 : today.getDay()
      lastWeekEnd.setDate(today.getDate() - daysToLastSunday)
      endDate = lastWeekEnd
      startDate = new Date(lastWeekEnd)
      startDate.setDate(lastWeekEnd.getDate() - 6)
      break
    }
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    case 'last_month': {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = new Date(firstThisMonth)
      endDate.setDate(firstThisMonth.getDate() - 1)
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      break
    }
    case 'last_90_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 89)
      break
    case 'this_year':
      startDate = new Date(today.getFullYear(), 0, 1)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    case 'last_year':
      startDate = new Date(today.getFullYear() - 1, 0, 1)
      endDate = new Date(today.getFullYear() - 1, 11, 31)
      break
    default:
      // Handle custom number of days (e.g., "last_45_days")
      if (periodType.startsWith('last_') && periodType.endsWith('_days')) {
        const daysMatch = periodType.match(/last_(\d+)_days/)
        if (daysMatch) {
          const numDays = Number.parseInt(daysMatch[1])
          endDate = new Date(today)
          endDate.setDate(today.getDate() - 1)
          startDate = new Date(endDate)
          startDate.setDate(endDate.getDate() - (numDays - 1))
        } else {
          // Fallback to last 30 days
          endDate = new Date(today)
          endDate.setDate(today.getDate() - 1)
          startDate = new Date(endDate)
          startDate.setDate(endDate.getDate() - 29)
        }
      } else {
        // Default to last 30 days
        endDate = new Date(today)
        endDate.setDate(today.getDate() - 1)
        startDate = new Date(endDate)
        startDate.setDate(endDate.getDate() - 29)
      }
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  }
}

async function makeGoogleAdsRequest(accountId: string, gaqlQuery: string): Promise<any> {
  logger.info('Making real Google Ads API request', { accountId, gaqlQuery })

  try {
    // Get Google Ads API credentials from environment variables
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error(
        'Missing Google Ads API credentials. Please set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN environment variables.'
      )
    }

    logger.info('Using Google Ads credentials', {
      developerToken: `${developerToken.substring(0, 10)}...`,
      clientId: `${clientId.substring(0, 30)}...`,
      clientIdFull: clientId, // Log full client ID for debugging
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      clientSecretLength: clientSecret.length,
      refreshTokenLength: refreshToken.length,
    })

    // Prepare token request body
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    logger.info('Token request details', {
      url: 'https://oauth2.googleapis.com/token',
      bodyParams: {
        client_id: clientId,
        grant_type: 'refresh_token',
        hasClientSecret: !!clientSecret,
        hasRefreshToken: !!refreshToken,
      },
    })

    // Get access token using refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Token refresh failed', {
        status: tokenResponse.status,
        error: errorText,
        clientId: `${clientId.substring(0, 20)}...`,
      })
      throw new Error(
        `Failed to refresh Google Ads access token: ${tokenResponse.status} - ${errorText}`
      )
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    logger.info('Successfully obtained access token')

    // Format customer ID (remove dashes if present)
    const formattedCustomerId = accountId.replace(/-/g, '')

    // Make Google Ads API request
    const adsApiUrl = `https://googleads.googleapis.com/v19/customers/${formattedCustomerId}/googleAds:search`

    const requestPayload = {
      query: gaqlQuery.trim(),
    }

    logger.info('Making Google Ads API request', {
      url: adsApiUrl,
      customerId: formattedCustomerId,
      query: gaqlQuery.trim(),
      managerCustomerId: POSITION2_MANAGER,
    })

    const adsResponse = await fetch(adsApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': POSITION2_MANAGER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!adsResponse.ok) {
      const errorText = await adsResponse.text()
      logger.error('Google Ads API request failed', {
        status: adsResponse.status,
        error: errorText,
        customerId: formattedCustomerId,
        managerCustomerId: POSITION2_MANAGER,
      })
      throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
    }

    const adsData = await adsResponse.json()
    logger.info('Google Ads API request successful', {
      resultsCount: adsData.results?.length || 0,
      customerId: formattedCustomerId,
      responseKeys: Object.keys(adsData),
      hasResults: !!adsData.results,
      firstResultKeys: adsData.results?.[0] ? Object.keys(adsData.results[0]) : [],
    })

    // Log a sample of the response structure for debugging
    if (adsData.results?.[0]) {
      logger.debug('Sample Google Ads API response structure', {
        sampleResult: {
          keys: Object.keys(adsData.results[0]),
          campaign: adsData.results[0].campaign ? Object.keys(adsData.results[0].campaign) : null,
          metrics: adsData.results[0].metrics ? Object.keys(adsData.results[0].metrics) : null,
          segments: adsData.results[0].segments ? Object.keys(adsData.results[0].segments) : null,
        },
      })
    }

    return adsData
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}

function processGoogleAdsResults(
  apiResult: any,
  requestId: string,
  gaqlQuery: string,
  periodLabel = 'primary'
): {
  result: any[]
  campaigns: Campaign[]
  gaqlQuery: string
  accountTotals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
    conversions_value: number
  }
} {
  const campaigns: Campaign[] = []
  const result: any[] = []
  let accountClicks = 0
  let accountImpressions = 0
  let accountCost = 0
  let accountConversions = 0
  let accountConversionsValue = 0

  if (apiResult.results && Array.isArray(apiResult.results)) {
    logger.info(
      `[${requestId}] Processing ${apiResult.results.length} results from Google Ads API (${periodLabel} period)`
    )

    for (const gaqlResult of apiResult.results) {
      // Log the structure of each result to understand the API response format
      logger.debug(`[${requestId}] Processing result (${periodLabel})`, {
        resultKeys: Object.keys(gaqlResult),
        hasCampaign: !!gaqlResult.campaign,
        hasMetrics: !!gaqlResult.metrics,
        campaignKeys: gaqlResult.campaign ? Object.keys(gaqlResult.campaign) : [],
        metricsKeys: gaqlResult.metrics ? Object.keys(gaqlResult.metrics) : [],
      })

      // Map the raw GAQL result to the result array
      const mappedResult: any = {
        // Include all original GAQL result fields
        ...gaqlResult,
        // Add processed/calculated fields for easier access
        // processed: {
        //   clicks: Number.parseInt(gaqlResult.metrics?.clicks || '0'),
        //   impressions: Number.parseInt(gaqlResult.metrics?.impressions || '0'),
        //   cost_micros: Number.parseInt(gaqlResult.metrics?.costMicros || '0'),
        //   cost: Math.round((Number.parseInt(gaqlResult.metrics?.costMicros || '0') / 1000000) * 100) / 100,
        //   conversions: Number.parseFloat(gaqlResult.metrics?.conversions || '0'),
        //   conversions_value: Number.parseFloat(gaqlResult.metrics?.conversionsValue || '0'),
        //   ctr: Number.parseFloat(gaqlResult.metrics?.ctr || '0'),
        //   avg_cpc_micros: Number.parseInt(gaqlResult.metrics?.averageCpc || '0'),
        //   avg_cpc: Math.round((Number.parseInt(gaqlResult.metrics?.averageCpc || '0') / 1000000) * 100) / 100,
        //   cost_per_conversion_micros: Number.parseInt(gaqlResult.metrics?.costPerConversion || '0'),
        //   cost_per_conversion: Number.parseInt(gaqlResult.metrics?.costPerConversion || '0') > 0
        //     ? Math.round((Number.parseInt(gaqlResult.metrics?.costPerConversion || '0') / 1000000) * 100) / 100
        //     : 0,
        //   conversion_rate: (Number.parseInt(gaqlResult.metrics?.clicks || '0') > 0)
        //     ? Math.round((Number.parseFloat(gaqlResult.metrics?.conversions || '0') / Number.parseInt(gaqlResult.metrics?.clicks || '0')) * 10000) / 100
        //     : 0,
        //   impression_share: Math.round(Number.parseFloat(gaqlResult.metrics?.searchImpressionShare || '0') * 10000) / 100,
        //   budget_lost_share: Math.round(Number.parseFloat(gaqlResult.metrics?.searchBudgetLostImpressionShare || '0') * 10000) / 100,
        //   rank_lost_share: Math.round(Number.parseFloat(gaqlResult.metrics?.searchRankLostImpressionShare || '0') * 10000) / 100,
        //   roas: (Number.parseInt(gaqlResult.metrics?.costMicros || '0') > 0)
        //     ? Math.round((Number.parseFloat(gaqlResult.metrics?.conversionsValue || '0') / (Number.parseInt(gaqlResult.metrics?.costMicros || '0') / 1000000)) * 100) / 100
        //     : 0,
        // }
      }

      result.push(mappedResult)

      const campaignData = gaqlResult.campaign
      const metricsData = gaqlResult.metrics

      // Add safety checks for undefined metricsData
      if (!metricsData) {
        logger.warn(`[${requestId}] Skipping result with missing metrics data (${periodLabel})`, {
          resultKeys: Object.keys(gaqlResult),
          campaignName: campaignData?.name || 'Unknown',
        })
        continue
      }

      const clicks = Number.parseInt(metricsData.clicks || '0')
      const impressions = Number.parseInt(metricsData.impressions || '0')
      const costMicros = Number.parseInt(metricsData.costMicros || '0')
      const conversions = Number.parseFloat(metricsData.conversions || '0')
      const conversionsValue = Number.parseFloat(metricsData.conversionsValue || '0')
      const avgCpcMicros = Number.parseInt(metricsData.averageCpc || '0')
      const costPerConversionMicros = Number.parseInt(metricsData.costPerConversion || '0')
      const impressionShare = Number.parseFloat(metricsData.searchImpressionShare || '0')
      const budgetLostShare = Number.parseFloat(metricsData.searchBudgetLostImpressionShare || '0')
      const rankLostShare = Number.parseFloat(metricsData.searchRankLostImpressionShare || '0')

      // Calculate conversion rate manually (conversions / clicks * 100)
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0

      accountClicks += clicks
      accountImpressions += impressions
      accountCost += costMicros
      accountConversions += conversions
      accountConversionsValue += conversionsValue

      const campaignInfo: Campaign = {
        name: campaignData.name || 'Unknown',
        status: campaignData.status || 'Unknown',
        clicks,
        impressions,
        cost: Math.round((costMicros / 1000000) * 100) / 100,
        conversions,
        conversions_value: Math.round(conversionsValue * 100) / 100,
        ctr: Math.round(Number.parseFloat(metricsData.ctr || '0') * 10000) / 100,
        avg_cpc: Math.round((avgCpcMicros / 1000000) * 100) / 100,
        cost_per_conversion:
          costPerConversionMicros > 0
            ? Math.round((costPerConversionMicros / 1000000) * 100) / 100
            : 0,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        impression_share: Math.round(impressionShare * 10000) / 100,
        budget_lost_share: Math.round(budgetLostShare * 10000) / 100,
        rank_lost_share: Math.round(rankLostShare * 10000) / 100,
        roas:
          costMicros > 0 ? Math.round((conversionsValue / (costMicros / 1000000)) * 100) / 100 : 0,
      }
      campaigns.push(campaignInfo)
    }
  } else {
    logger.warn(`[${requestId}] No results found in Google Ads API response (${periodLabel})`, {
      hasResults: !!apiResult.results,
      resultsType: typeof apiResult.results,
      isArray: Array.isArray(apiResult.results),
      apiResultKeys: Object.keys(apiResult),
    })
  }

  return {
    result,
    campaigns,
    gaqlQuery,
    accountTotals: {
      clicks: accountClicks,
      impressions: accountImpressions,
      cost: Math.round((accountCost / 1000000) * 100) / 100,
      conversions: accountConversions,
      conversions_value: Math.round(accountConversionsValue * 100) / 100,
    },
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads query request started`)

    const body: GoogleAdsRequest = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, accounts, period_type, output_format = 'detailed', sort_by = 'cost_desc' } = body

    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    logger.info(`[${requestId}] Processing query`, { query, accounts, period_type })

    // Get account information first
    logger.info(`[${requestId}] Looking up account`, {
      accounts,
      availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
    })

    const accountInfo = GOOGLE_ADS_ACCOUNTS[accounts]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key`, {
        accounts,
        availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
      })
      return NextResponse.json(
        {
          error: `Invalid account key: ${accounts}. Available accounts: ${Object.keys(GOOGLE_ADS_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
    })

    // Use smart parsing to generate GAQL query based on the user's question
    const {
      gaqlQuery,
      periodType,
      queryType,
      startDate,
      endDate,
      isComparison,
      comparisonQuery,
      comparisonStartDate,
      comparisonEndDate,
    } = await generateSmartGAQL(query, accountInfo.name)

    logger.info(`[${requestId}] Smart-generated query details`, {
      queryType,
      periodType,
      dateRange: `${startDate} to ${endDate}`,
      account: accountInfo.name,
      gaqlQuery: gaqlQuery,
      isComparison,
      comparisonDateRange: isComparison ? `${comparisonStartDate} to ${comparisonEndDate}` : null,
    })

    // Make the API request(s) using the actual account ID and generated query
    logger.info(`[${requestId}] ===== MAIN WEEK QUERY =====`, {
      dateRange: `${startDate} to ${endDate}`,
      query: gaqlQuery,
    })
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, gaqlQuery)
    let comparisonApiResult = null

    // If this is a comparison query, make a second API call for the comparison period
    if (isComparison && comparisonQuery) {
      logger.info(`[${requestId}] ===== COMPARISON WEEK QUERY =====`, {
        dateRange: `${comparisonStartDate} to ${comparisonEndDate}`,
        query: comparisonQuery,
      })
      comparisonApiResult = await makeGoogleAdsRequest(accountInfo.id, comparisonQuery)
    }

    // Process primary period results
    const primaryResults = processGoogleAdsResults(apiResult, requestId, gaqlQuery, 'primary')
    logger.info(`[${requestId}] ===== MAIN WEEK TOTALS =====`, {
      dateRange: `${startDate} to ${endDate}`,
      cost: primaryResults.accountTotals.cost,
      clicks: primaryResults.accountTotals.clicks,
      conversions: primaryResults.accountTotals.conversions,
      conversions_value: primaryResults.accountTotals.conversions_value,
      campaigns: primaryResults.campaigns.length,
    })

    // Process comparison period results if available
    let comparisonResults = null
    if (comparisonApiResult && comparisonQuery) {
      comparisonResults = processGoogleAdsResults(
        comparisonApiResult,
        requestId,
        comparisonQuery,
        'comparison'
      )
      logger.info(`[${requestId}] ===== COMPARISON WEEK TOTALS =====`, {
        dateRange: `${comparisonStartDate} to ${comparisonEndDate}`,
        cost: comparisonResults.accountTotals.cost,
        clicks: comparisonResults.accountTotals.clicks,
        conversions: comparisonResults.accountTotals.conversions,
        conversions_value: comparisonResults.accountTotals.conversions_value,
        campaigns: comparisonResults.campaigns.length,
      })
    }

    const accountResult: AccountResult = {
      account_id: accountInfo.id,
      account_name: accountInfo.name,
      campaigns: primaryResults.campaigns,
      result: primaryResults.result,
      gaqlQuery: primaryResults.gaqlQuery,
      total_campaigns: primaryResults.campaigns.length,
      account_totals: {
        clicks: primaryResults.accountTotals.clicks,
        impressions: primaryResults.accountTotals.impressions,
        cost: primaryResults.accountTotals.cost,
        conversions: primaryResults.accountTotals.conversions,
        conversions_value: primaryResults.accountTotals.conversions_value,
        ctr:
          primaryResults.accountTotals.impressions > 0
            ? Math.round(
                (primaryResults.accountTotals.clicks / primaryResults.accountTotals.impressions) *
                  100 *
                  100
              ) / 100
            : 0,
        avg_cpc:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.clicks) * 100
              ) / 100
            : 0,
        conversion_rate:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.conversions / primaryResults.accountTotals.clicks) *
                  100 *
                  100
              ) / 100
            : 0,
        cost_per_conversion:
          primaryResults.accountTotals.conversions > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.conversions) * 100
              ) / 100
            : 0,
      },
    }

    // Add comparison data to account result if available
    if (comparisonResults) {
      ;(accountResult as any).comparison_campaigns = comparisonResults.campaigns
      ;(accountResult as any).comparison_totals = {
        clicks: comparisonResults.accountTotals.clicks,
        impressions: comparisonResults.accountTotals.impressions,
        cost: comparisonResults.accountTotals.cost,
        conversions: comparisonResults.accountTotals.conversions,
        conversions_value: comparisonResults.accountTotals.conversions_value,
        ctr:
          comparisonResults.accountTotals.impressions > 0
            ? Math.round(
                (comparisonResults.accountTotals.clicks /
                  comparisonResults.accountTotals.impressions) *
                  100 *
                  100
              ) / 100
            : 0,
        avg_cpc:
          comparisonResults.accountTotals.clicks > 0
            ? Math.round(
                (comparisonResults.accountTotals.cost / comparisonResults.accountTotals.clicks) *
                  100
              ) / 100
            : 0,
        conversion_rate:
          comparisonResults.accountTotals.clicks > 0
            ? Math.round(
                (comparisonResults.accountTotals.conversions /
                  comparisonResults.accountTotals.clicks) *
                  100 *
                  100
              ) / 100
            : 0,
        cost_per_conversion:
          comparisonResults.accountTotals.conversions > 0
            ? Math.round(
                (comparisonResults.accountTotals.cost /
                  comparisonResults.accountTotals.conversions) *
                  100
              ) / 100
            : 0,
      }
    }

    // Build response with clear main week and comparison week structure
    const response = {
      query,
      query_type: queryType,
      period_type: periodType,
      is_comparison: isComparison || false,
      accounts_found: 1,

      // Main Week Data (Current/Requested Period)
      mainWeek: {
        dateRange: `${startDate} to ${endDate}`,
        totals: {
          clicks: primaryResults.accountTotals.clicks,
          impressions: primaryResults.accountTotals.impressions,
          cost: primaryResults.accountTotals.cost,
          conversions: primaryResults.accountTotals.conversions,
          conversions_value: primaryResults.accountTotals.conversions_value || 0,
          ctr:
            primaryResults.accountTotals.impressions > 0
              ? Math.round(
                  (primaryResults.accountTotals.clicks / primaryResults.accountTotals.impressions) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_cpc:
            primaryResults.accountTotals.clicks > 0
              ? Math.round(
                  (primaryResults.accountTotals.cost / primaryResults.accountTotals.clicks) * 100
                ) / 100
              : 0,
          conversion_rate:
            primaryResults.accountTotals.clicks > 0
              ? Math.round(
                  (primaryResults.accountTotals.conversions / primaryResults.accountTotals.clicks) *
                    100 *
                    100
                ) / 100
              : 0,
          cost_per_conversion:
            primaryResults.accountTotals.conversions > 0
              ? Math.round(
                  (primaryResults.accountTotals.cost / primaryResults.accountTotals.conversions) *
                    100
                ) / 100
              : 0,
        },
        campaigns: primaryResults.campaigns,
      },

      // Comparison Week Data (Previous Period) - Only if comparison requested
      comparisonWeek: comparisonResults
        ? {
            dateRange: `${comparisonStartDate} to ${comparisonEndDate}`,
            totals: {
              clicks: comparisonResults.accountTotals.clicks,
              impressions: comparisonResults.accountTotals.impressions,
              cost: comparisonResults.accountTotals.cost,
              conversions: comparisonResults.accountTotals.conversions,
              conversions_value: comparisonResults.accountTotals.conversions_value || 0,
              ctr:
                comparisonResults.accountTotals.impressions > 0
                  ? Math.round(
                      (comparisonResults.accountTotals.clicks /
                        comparisonResults.accountTotals.impressions) *
                        100 *
                        100
                    ) / 100
                  : 0,
              avg_cpc:
                comparisonResults.accountTotals.clicks > 0
                  ? Math.round(
                      (comparisonResults.accountTotals.cost /
                        comparisonResults.accountTotals.clicks) *
                        100
                    ) / 100
                  : 0,
              conversion_rate:
                comparisonResults.accountTotals.clicks > 0
                  ? Math.round(
                      (comparisonResults.accountTotals.conversions /
                        comparisonResults.accountTotals.clicks) *
                        100 *
                        100
                    ) / 100
                  : 0,
              cost_per_conversion:
                comparisonResults.accountTotals.conversions > 0
                  ? Math.round(
                      (comparisonResults.accountTotals.cost /
                        comparisonResults.accountTotals.conversions) *
                        100
                    ) / 100
                  : 0,
            },
            campaigns: comparisonResults.campaigns,
          }
        : null,

      // Legacy fields for backward compatibility
      date_range: `${startDate} to ${endDate}`,
      comparison_date_range: isComparison ? `${comparisonStartDate} to ${comparisonEndDate}` : null,
      grand_totals: {
        clicks: primaryResults.accountTotals.clicks,
        impressions: primaryResults.accountTotals.impressions,
        cost: primaryResults.accountTotals.cost,
        conversions: primaryResults.accountTotals.conversions,
        conversions_value: primaryResults.accountTotals.conversions_value || 0,
      },

      results: [accountResult],
      data_availability: {
        overall_status: 'available',
        accounts: [
          {
            account_name: accountInfo.name,
            account_id: accountInfo.id,
            data_available: true,
            latest_data_date: endDate,
            requested_range: `${startDate} to ${endDate}`,
            comparison_range: isComparison
              ? `${comparisonStartDate} to ${comparisonEndDate}`
              : null,
            days_behind: 1,
            message: isComparison
              ? `Data available for both periods: ${startDate} to ${endDate} and ${comparisonStartDate} to ${comparisonEndDate}`
              : `Data available until ${endDate}`,
          },
        ],
        summary: '1/1 accounts have requested data',
      },
    }

    const executionTime = Date.now() - startTime
    logger.info(`[${requestId}] Google Ads query completed successfully`, {
      executionTime,
      accountsFound: 1,
      totalCampaigns: primaryResults.campaigns.length,
      grandTotalCost: response.grand_totals.cost,
      isComparison,
      comparisonCampaigns: comparisonResults?.campaigns.length || 0,
      comparisonTotalCost: comparisonResults?.accountTotals.cost || 0,
    })

    logger.info(`[${requestId}] Returning response`, {
      responseKeys: Object.keys(response),
      resultsLength: response.results.length,
      firstResult: response.results[0]
        ? {
            account_name: response.results[0].account_name,
            campaigns_count: response.results[0].campaigns.length,
          }
        : null,
    })

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    logger.error(`[${requestId}] Google Ads query failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime,
    })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to process Google Ads query',
      },
      { status: 500 }
    )
  }
}
