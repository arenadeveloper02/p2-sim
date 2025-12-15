import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import {
  FACEBOOK_ACCOUNTS,
  type FacebookAccountKey,
  getFacebookAccountId,
  getFacebookAccountName,
} from '@/lib/facebook-accounts'
import { createLogger } from '@/lib/logs/console/logger'
import { FB_GRAPH_URL } from '../query/constants'

const logger = createLogger('FacebookAdsAccountReport')

// Types
type TimeRange = { since: string; until: string }

interface InfusionDataRow {
  account_key?: string
  account_name?: string
  infusion_amount?: number
  amount?: number
}

interface AccountReportRequest {
  accounts?: string[] // optional - defaults to ALL Position2 accounts
  date_preset?: string // e.g., 'last_30d', 'this_month' - Agent decides dynamically
  time_range?: TimeRange // custom date range - Agent decides dynamically
  infusion_data?: InfusionDataRow[] | Record<string, number> // from Google Sheets (per-account)
  total_infusion?: number // Simple total infusion amount (e.g., 100000) - overrides infusion_data
  agency_cut_pct?: number // optional - user can configure, default 0 (no cut)
}

interface AccountReportRow {
  account_key: string
  account_id: string
  account_name: string
  infusion_amount: number
  agency_cut_amount: number
  net_infusion_amount: number
  spend_amount: number
  remaining_amount: number
  remaining_pct: number
  low_balance_warning: boolean
}

interface AccountReportResponse {
  success: boolean
  requestId: string
  timestamp: string
  date_range: {
    preset?: string
    since?: string
    until?: string
  }
  summary: {
    total_infusion: number
    total_agency_cut: number
    total_net_infusion: number
    total_spend: number
    total_remaining: number
    remaining_pct: number
    accounts_count: number
    low_balance_accounts_count: number
  }
  accounts: AccountReportRow[]
  error?: string
}

/**
 * Fetch account-level spend from Meta Insights API
 */
async function fetchAccountSpend(
  accountId: string,
  datePreset: string,
  timeRange?: TimeRange
): Promise<number> {
  const accessToken = process.env.FB_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error(
      'Missing Facebook access token. Please set FB_ACCESS_TOKEN environment variable.'
    )
  }

  const apiUrl = `${FB_GRAPH_URL}/${accountId}/insights`

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'spend',
    level: 'account',
    time_increment: 'all_days',
  })

  if (timeRange) {
    params.append('time_range', JSON.stringify(timeRange))
  } else {
    params.append('date_preset', datePreset)
  }

  const fullUrl = `${apiUrl}?${params.toString()}`

  logger.info('Fetching account spend', { accountId, datePreset, timeRange, url: fullUrl })

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Failed to fetch account spend', {
      accountId,
      status: response.status,
      error: errorText,
    })
    // Return 0 if we can't fetch spend (account might have no activity)
    return 0
  }

  const data = await response.json()

  logger.info('Account spend response', {
    accountId,
    dataLength: data.data?.length || 0,
    rawData: JSON.stringify(data).substring(0, 500),
  })

  // Extract spend from response
  // Response format: { data: [{ spend: "123.45", ... }] }
  if (data.data && data.data.length > 0 && data.data[0].spend) {
    const spend = Number.parseFloat(data.data[0].spend)
    logger.info('Parsed spend', { accountId, spend })
    return spend
  }

  logger.warn('No spend data found for account', { accountId, data })
  return 0
}

/**
 * Parse infusion data from various formats (Google Sheets output, JSON object, etc.)
 */
function parseInfusionData(
  infusionData: InfusionDataRow[] | Record<string, number> | undefined
): Map<string, number> {
  const infusionMap = new Map<string, number>()

  if (!infusionData) {
    return infusionMap
  }

  // Handle array format (from Google Sheets)
  if (Array.isArray(infusionData)) {
    for (const row of infusionData) {
      const key = row.account_key || row.account_name
      const amount = row.infusion_amount || row.amount || 0

      if (key && typeof amount === 'number') {
        // Try to match by key first, then by name
        const normalizedKey = key.toLowerCase().replace(/\s+/g, '_')
        infusionMap.set(normalizedKey, amount)
      }
    }
  }
  // Handle object format { account_key: amount }
  else if (typeof infusionData === 'object') {
    for (const [key, amount] of Object.entries(infusionData)) {
      if (typeof amount === 'number') {
        infusionMap.set(key.toLowerCase(), amount)
      }
    }
  }

  return infusionMap
}

/**
 * Find infusion amount for an account (tries multiple matching strategies)
 */
function findInfusionAmount(
  accountKey: string,
  accountName: string,
  infusionMap: Map<string, number>
): number {
  // Try exact key match
  if (infusionMap.has(accountKey)) {
    return infusionMap.get(accountKey)!
  }

  // Try normalized name match
  const normalizedName = accountName.toLowerCase().replace(/\s+/g, '_')
  if (infusionMap.has(normalizedName)) {
    return infusionMap.get(normalizedName)!
  }

  // Try partial match
  for (const [key, amount] of infusionMap.entries()) {
    if (key.includes(accountKey) || accountKey.includes(key)) {
      return amount
    }
    if (key.includes(normalizedName) || normalizedName.includes(key)) {
      return amount
    }
  }

  return 0
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  logger.info('Facebook Ads Account Report request received', { requestId })

  try {
    const body: AccountReportRequest = await request.json()
    const {
      accounts,
      date_preset = 'last_30d',
      time_range,
      infusion_data,
      total_infusion, // Simple total infusion from sheet (e.g., 100000)
      agency_cut_pct = 0, // Default to 0 (no cut) - user can configure
    } = body

    // Default to ALL Position2 accounts if none specified
    const accountsToProcess: string[] =
      accounts && Array.isArray(accounts) && accounts.length > 0
        ? accounts
        : Object.keys(FACEBOOK_ACCOUNTS)

    logger.info('Processing Account Report', {
      requestId,
      accountsCount: accountsToProcess.length,
      datePreset: date_preset,
      timeRange: time_range,
      hasInfusionData: !!infusion_data,
      agencyCutPct: agency_cut_pct,
    })

    // Parse infusion data (per-account breakdown, if provided)
    const infusionMap = parseInfusionData(infusion_data)

    // Process each account - fetch spend from Meta
    const accountRows: AccountReportRow[] = []
    let totalSpend = 0

    for (const accountKey of accountsToProcess) {
      // Validate account key exists
      if (!(accountKey in FACEBOOK_ACCOUNTS)) {
        logger.warn('Unknown account key, skipping', { accountKey })
        continue
      }

      const typedKey = accountKey as FacebookAccountKey
      const accountId = getFacebookAccountId(typedKey)
      const accountName = getFacebookAccountName(typedKey)

      // Fetch live spend from Meta
      let spendAmount = 0
      try {
        spendAmount = await fetchAccountSpend(accountId, date_preset, time_range)
      } catch (error) {
        logger.error('Failed to fetch spend for account', {
          accountKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Continue with 0 spend
      }

      totalSpend += spendAmount

      // Per-account row shows spend only (infusion is at total level)
      accountRows.push({
        account_key: accountKey,
        account_id: accountId,
        account_name: accountName,
        infusion_amount: 0, // Not tracked per-account when using total_infusion
        agency_cut_amount: 0,
        net_infusion_amount: 0,
        spend_amount: Math.round(spendAmount * 100) / 100,
        remaining_amount: 0,
        remaining_pct: 0,
        low_balance_warning: false,
      })
    }

    // Use total_infusion from sheet if provided, otherwise sum from per-account infusion_data
    let totalInfusion = 0
    if (typeof total_infusion === 'number' && total_infusion > 0) {
      totalInfusion = total_infusion
    } else {
      // Sum from per-account infusion map
      for (const amount of infusionMap.values()) {
        totalInfusion += amount
      }
    }

    const totalAgencyCut = totalInfusion * (agency_cut_pct / 100)
    const totalNetInfusion = totalInfusion - totalAgencyCut
    const totalRemaining = totalNetInfusion - totalSpend
    const totalRemainingPct = totalNetInfusion > 0 ? (totalRemaining / totalNetInfusion) * 100 : 0
    const lowBalanceWarning = totalNetInfusion > 0 && totalRemainingPct < 20

    const response: AccountReportResponse = {
      success: true,
      requestId,
      timestamp,
      date_range: {
        preset: time_range ? undefined : date_preset,
        since: time_range?.since,
        until: time_range?.until,
      },
      summary: {
        total_infusion: Math.round(totalInfusion * 100) / 100,
        total_agency_cut: Math.round(totalAgencyCut * 100) / 100,
        total_net_infusion: Math.round(totalNetInfusion * 100) / 100,
        total_spend: Math.round(totalSpend * 100) / 100,
        total_remaining: Math.round(totalRemaining * 100) / 100,
        remaining_pct: Math.round(totalRemainingPct * 100) / 100,
        accounts_count: accountRows.length,
        low_balance_accounts_count: lowBalanceWarning ? 1 : 0,
      },
      accounts: accountRows,
    }

    logger.info('Account Report generated successfully', {
      requestId,
      accountsProcessed: accountRows.length,
      totalSpend,
      totalRemaining,
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Facebook Ads Account Report failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        requestId,
        timestamp,
      },
      { status: 500 }
    )
  }
}
