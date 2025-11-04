import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

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

// Google Ads API credentials from environment
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
const GOOGLE_ADS_REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET

// Helper function to format customer ID (add dashes)
function formatCustomerId(customerId: string): string {
  const cleaned = customerId.replace(/-/g, '')
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return cleaned
}

// Helper function to get OAuth access token
async function getAccessToken(): Promise<string> {
  if (!GOOGLE_ADS_REFRESH_TOKEN || !GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
    throw new Error('Missing OAuth credentials in environment variables')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh access token: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

// Helper function to get headers with auto token refresh
async function getHeadersWithAutoToken(managerId?: string): Promise<Record<string, string>> {
  const accessToken = await getAccessToken()
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN!,
    'Content-Type': 'application/json',
  }

  if (managerId) {
    headers['login-customer-id'] = formatCustomerId(managerId)
  }

  return headers
}

// Execute GAQL query
async function executeGaql(
  customerId: string,
  query: string,
  managerId?: string
): Promise<any> {
  const headers = await getHeadersWithAutoToken(managerId)
  const formattedCustomerId = formatCustomerId(customerId).replace(/-/g, '')
  
  const url = `https://googleads.googleapis.com/v19/customers/${formattedCustomerId}/googleAds:search`
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GAQL query failed: ${response.status} ${response.statusText} - ${error}`)
  }

  const data = await response.json()
  
  return {
    results: data.results || [],
    totalRows: data.results?.length || 0,
    fieldMask: data.fieldMask,
  }
}

// Get customer name
async function getCustomerName(customerId: string): Promise<string> {
  try {
    const query = 'SELECT customer.descriptive_name FROM customer'
    const result = await executeGaql(customerId, query)
    const rows = result.results || []
    if (rows.length === 0) {
      return 'Name not available (no results)'
    }
    return rows[0].customer?.descriptiveName || 'Name not available (missing field)'
  } catch (error) {
    return 'Name not available (error)'
  }
}

// Check if account is a manager (MCC)
async function isManagerAccount(customerId: string): Promise<boolean> {
  try {
    const query = 'SELECT customer.manager FROM customer'
    const result = await executeGaql(customerId, query)
    const rows = result.results || []
    if (rows.length === 0) {
      return false
    }
    return Boolean(rows[0].customer?.manager)
  } catch (error) {
    return false
  }
}

// Get sub-accounts under a manager account
async function getSubAccounts(managerId: string): Promise<any[]> {
  try {
    const query = `
      SELECT 
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.level,
        customer_client.manager
      FROM customer_client
      WHERE customer_client.level > 0
    `
    const result = await executeGaql(managerId, query)
    const rows = result.results || []
    
    const subs: any[] = []
    for (const row of rows) {
      const client = row.customerClient || row.customer_client || {}
      const cid = formatCustomerId(String(client.id || ''))
      subs.push({
        id: cid,
        name: client.descriptiveName || `Sub-account ${cid}`,
        access_type: 'managed',
        is_manager: Boolean(client.manager),
        parent_id: managerId,
        level: Number(client.level || 0),
      })
    }
    return subs
  } catch (error) {
    return []
  }
}

// Tool: run_gaql - Execute GAQL query
async function runGaql(customerId: string, query: string, managerId?: string): Promise<any> {
  logger.info(`Executing GAQL query for customer ${customerId}...`)
  logger.info(`Query: ${query}`)

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error('Google Ads Developer Token is not set in environment variables')
  }

  try {
    const result = await executeGaql(customerId, query, managerId)
    logger.info(`GAQL query successful. Found ${result.totalRows} rows.`)
    return result
  } catch (error) {
    logger.error(`GAQL query failed: ${error}`)
    throw error
  }
}

// Tool: list_accounts - List all accessible accounts
async function listAccounts(): Promise<any> {
  logger.info('Checking credentials and preparing to list accounts...')

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error('Google Ads Developer Token is not set in environment variables')
  }

  try {
    const headers = await getHeadersWithAutoToken()
    
    // Fetch top-level accessible customers
    const url = 'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers'
    const response = await fetch(url, { headers })
    
    if (!response.ok) {
      const error = await response.text()
      logger.error(`Failed to list accessible accounts: ${response.status} ${response.statusText}`)
      throw new Error(`Error listing accounts: ${response.status} ${response.statusText} - ${error}`)
    }
    
    const data = await response.json()
    const resourceNames = data.resourceNames || []
    
    if (resourceNames.length === 0) {
      logger.info('No accessible Google Ads accounts found.')
      return { accounts: [], message: 'No accessible accounts found.' }
    }

    logger.info(`Found ${resourceNames.length} top-level accessible accounts. Fetching details...`)

    const accounts: any[] = []
    const seen = new Set<string>()
    
    for (const resource of resourceNames) {
      const cid = resource.split('/').pop()
      const fid = formatCustomerId(cid)
      const name = await getCustomerName(fid)
      const manager = await isManagerAccount(fid)
      
      const account = {
        id: fid,
        name,
        access_type: 'direct',
        is_manager: manager,
        level: 0,
      }
      
      accounts.push(account)
      seen.add(fid)
      
      // Include sub-accounts (and nested)
      if (manager) {
        const subs = await getSubAccounts(fid)
        for (const sub of subs) {
          if (!seen.has(sub.id)) {
            accounts.push(sub)
            seen.add(sub.id)
            
            // Nested level
            if (sub.is_manager) {
              const nested = await getSubAccounts(sub.id)
              for (const n of nested) {
                if (!seen.has(n.id)) {
                  accounts.push(n)
                  seen.add(n.id)
                }
              }
            }
          }
        }
      }
    }

    logger.info(`Finished processing. Found a total of ${accounts.length} accounts.`)

    return {
      accounts,
      total_accounts: accounts.length,
    }
  } catch (error) {
    logger.error(`Error listing accounts: ${error}`)
    throw error
  }
}

// Tool: keyword_planner - Generate keyword ideas
async function runKeywordPlanner(params: {
  customer_id: string
  keywords?: string[]
  manager_id?: string
  page_url?: string
  start_year?: number
  start_month?: string
  end_year?: number
  end_month?: string
}): Promise<any> {
  const { customer_id, keywords = [], manager_id, page_url, start_year, start_month, end_year, end_month } = params

  logger.info(`Generating keyword ideas for customer ${customer_id}...`)
  if (keywords.length > 0) {
    logger.info(`Seed keywords: ${keywords.join(', ')}`)
  }
  if (page_url) {
    logger.info(`Page URL: ${page_url}`)
  }

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error('Google Ads Developer Token is not set in environment variables')
  }

  // Validate that at least one of keywords or page_url is provided
  if (keywords.length === 0 && !page_url) {
    throw new Error('At least one of keywords or page URL is required, but neither was specified.')
  }

  try {
    const headers = await getHeadersWithAutoToken(manager_id)
    
    const formattedCustomerId = formatCustomerId(customer_id).replace(/-/g, '')
    const url = `https://googleads.googleapis.com/v19/customers/${formattedCustomerId}:generateKeywordIdeas`
    
    // Set up dynamic date range with user-provided values or smart defaults
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' }).toUpperCase()
    
    const validMonths = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                         'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
    
    // Use provided dates or fall back to defaults
    const startYearFinal = start_year || (currentYear - 1)
    const startMonthFinal = start_month && validMonths.includes(start_month.toUpperCase()) 
      ? start_month.toUpperCase() 
      : 'JANUARY'
    const endYearFinal = end_year || currentYear
    const endMonthFinal = end_month && validMonths.includes(end_month.toUpperCase())
      ? end_month.toUpperCase()
      : currentMonth
    
    // Build the request body according to Google Ads API specification
    const requestBody: any = {
      language: 'languageConstants/1000',
      geoTargetConstants: ['geoTargetConstants/2840'],
      keywordPlanNetwork: 'GOOGLE_SEARCH_AND_PARTNERS',
      includeAdultKeywords: false,
      pageSize: 25,
      historicalMetricsOptions: {
        yearMonthRange: {
          start: {
            year: startYearFinal,
            month: startMonthFinal,
          },
          end: {
            year: endYearFinal,
            month: endMonthFinal,
          },
        },
      },
    }
    
    // Set the appropriate seed based on what's provided
    if (keywords.length === 0 && page_url) {
      requestBody.urlSeed = { url: page_url }
    } else if (keywords.length > 0 && !page_url) {
      requestBody.keywordSeed = { keywords }
    } else if (keywords.length > 0 && page_url) {
      requestBody.keywordAndUrlSeed = {
        url: page_url,
        keywords,
      }
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Keyword planner request failed: ${response.status} ${response.statusText}`)
      throw new Error(`Error executing request: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    const results = await response.json()
    
    if (!results.results || results.results.length === 0) {
      const message = `No keyword ideas found for the provided inputs.\n\nKeywords: ${keywords.join(', ') || 'None'}\nPage URL: ${page_url || 'None'}\nAccount: ${formattedCustomerId}`
      logger.info(message)
      return {
        message,
        keywords: keywords || [],
        page_url: page_url,
        date_range: `${startMonthFinal} ${startYearFinal} to ${endMonthFinal} ${endYearFinal}`,
      }
    }
    
    // Format the results for better readability
    const formattedResults = results.results.map((result: any) => {
      const keywordIdea = result.keywordIdeaMetrics || {}
      const keywordText = result.text || 'N/A'
      
      return {
        keyword: keywordText,
        avg_monthly_searches: keywordIdea.avgMonthlySearches || 'N/A',
        competition: keywordIdea.competition || 'N/A',
        competition_index: keywordIdea.competitionIndex || 'N/A',
        low_top_of_page_bid_micros: keywordIdea.lowTopOfPageBidMicros || 'N/A',
        high_top_of_page_bid_micros: keywordIdea.highTopOfPageBidMicros || 'N/A',
      }
    })
    
    logger.info(`Found ${formattedResults.length} keyword ideas.`)
    
    return {
      keyword_ideas: formattedResults,
      total_ideas: formattedResults.length,
      input_keywords: keywords || [],
      input_page_url: page_url,
      date_range: `${startMonthFinal} ${startYearFinal} to ${endMonthFinal} ${endYearFinal}`,
    }
  } catch (error) {
    logger.error(`An unexpected error occurred: ${error}`)
    throw error
  }
}

// GAQL Reference Documentation
const GAQL_REFERENCE = `
## Basic Query Structure
SELECT field1, field2, ... 
FROM resource_type
WHERE condition
ORDER BY field [ASC|DESC]
LIMIT n

## Common Field Types

### Resource Fields
- campaign.id, campaign.name, campaign.status
- ad_group.id, ad_group.name, ad_group.status
- ad_group_ad.ad.id, ad_group_ad.ad.final_urls
- ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type (for keyword_view)

### Metric Fields
- metrics.impressions
- metrics.clicks
- metrics.cost_micros
- metrics.conversions
- metrics.conversions_value (direct conversion revenue - primary revenue metric)
- metrics.ctr
- metrics.average_cpc

### Segment Fields
- segments.date
- segments.device
- segments.day_of_week

## Common WHERE Clauses

### Date Ranges
- WHERE segments.date DURING LAST_7_DAYS
- WHERE segments.date DURING LAST_30_DAYS
- WHERE segments.date BETWEEN '2023-01-01' AND '2023-01-31'

### Filtering
- WHERE campaign.status = 'ENABLED'
- WHERE metrics.clicks > 100
- WHERE campaign.name LIKE '%Brand%'
- Use LIKE '%keyword%' instead of CONTAINS 'keyword' (CONTAINS not supported)

## EXAMPLE QUERIES:

1. Basic campaign metrics:
SELECT 
  campaign.id,
  campaign.name, 
  metrics.clicks, 
  metrics.impressions,
  metrics.cost_micros
FROM campaign 
WHERE segments.date DURING LAST_7_DAYS

2. Ad group performance:
SELECT 
  campaign.id,
  ad_group.name, 
  metrics.conversions, 
  metrics.cost_micros,
  campaign.name
FROM ad_group 
WHERE metrics.clicks > 100

3. Keyword analysis (CORRECT field names):
SELECT 
  campaign.id,
  ad_group_criterion.keyword.text, 
  ad_group_criterion.keyword.match_type,
  metrics.average_position, 
  metrics.ctr
FROM keyword_view 
WHERE segments.date DURING LAST_30_DAYS
ORDER BY metrics.impressions DESC

4. Get conversion data with revenue:
SELECT
  campaign.id,
  campaign.name,
  metrics.conversions,
  metrics.conversions_value,
  metrics.all_conversions_value,
  metrics.cost_micros
FROM campaign
WHERE segments.date DURING LAST_30_DAYS

## IMPORTANT NOTES & COMMON ERRORS TO AVOID:

### Field Errors to Avoid:
WRONG: campaign.campaign_budget.amount_micros
CORRECT: campaign_budget.amount_micros (query from campaign_budget resource)

WRONG: keyword.text, keyword.match_type  
CORRECT: ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type

### Required Fields:
- Always include campaign.id when querying ad_group, keyword_view, or other campaign-related resources
- Some resources require specific reference fields in SELECT clause

### Revenue Metrics:
- metrics.conversions_value = Direct conversion revenue (use for ROI calculations)
- metrics.all_conversions_value = Total attributed revenue (includes view-through)

### String Matching:
- Use LIKE '%keyword%' not CONTAINS 'keyword'
- GAQL does not support CONTAINS operator

NOTE:
- Date ranges must be finite: LAST_7_DAYS, LAST_30_DAYS, or BETWEEN dates
- Cannot use open-ended ranges like >= '2023-01-31'
- Always include campaign.id when error messages request it
`

// Main POST handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tool, customer_id, query, manager_id, keywords, page_url, start_year, start_month, end_year, end_month } = body

    logger.info(`Google Ads API request: tool=${tool}`)

    // Route to appropriate tool
    switch (tool) {
      case 'run_gaql':
        if (!customer_id || !query) {
          return NextResponse.json(
            { error: 'customer_id and query are required for run_gaql' },
            { status: 400 }
          )
        }
        const gaqlResult = await runGaql(customer_id, query, manager_id)
        return NextResponse.json(gaqlResult)

      case 'list_accounts':
        const accountsResult = await listAccounts()
        return NextResponse.json(accountsResult)

      case 'keyword_planner':
        if (!customer_id) {
          return NextResponse.json(
            { error: 'customer_id is required for keyword_planner' },
            { status: 400 }
          )
        }
        const keywordResult = await runKeywordPlanner({
          customer_id,
          keywords,
          manager_id,
          page_url,
          start_year,
          start_month,
          end_year,
          end_month,
        })
        return NextResponse.json(keywordResult)

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${tool}. Available tools: run_gaql, list_accounts, keyword_planner` },
          { status: 400 }
        )
    }
  } catch (error) {
    logger.error(`Google Ads API error: ${error}`)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to process Google Ads request',
      },
      { status: 500 }
    )
  }
}

// GET handler for GAQL reference
export async function GET() {
  return NextResponse.json({
    reference: GAQL_REFERENCE,
    available_tools: ['run_gaql', 'list_accounts', 'keyword_planner'],
    accounts: GOOGLE_ADS_ACCOUNTS,
  })
}
