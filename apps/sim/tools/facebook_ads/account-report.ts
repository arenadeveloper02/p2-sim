import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('FacebookAdsAccountReport')

export interface AccountReportRow {
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

export interface AccountReportSummary {
  total_infusion: number
  total_agency_cut: number
  total_net_infusion: number
  total_spend: number
  total_remaining: number
  remaining_pct: number
  accounts_count: number
  low_balance_accounts_count: number
}

export interface FacebookAdsAccountReportOutput {
  success: boolean
  requestId: string
  timestamp: string
  date_range: {
    preset?: string
    since?: string
    until?: string
  }
  summary: AccountReportSummary
  accounts: AccountReportRow[]
  error?: string
}

export type FacebookAdsAccountReportResponse = {
  success: boolean
  output: FacebookAdsAccountReportOutput
  error?: string
}

export const facebookAdsAccountReportTool: ToolConfig = {
  id: 'facebook_ads_account_report',
  version: '1.0.0',
  name: 'Facebook Ads Account Report',
  description:
    'Generate a financial report for ALL Position2 Facebook Ads accounts. IMPORTANT: You MUST parse the date from user question and pass it as time_range parameter. For example, if user asks "December 1-15 2024", pass time_range: {"since": "2024-12-01", "until": "2024-12-15"}. If user asks "November 2024", pass time_range: {"since": "2024-11-01", "until": "2024-11-30"}.',
  params: {
    time_range: {
      type: 'json',
      description:
        'REQUIRED: Custom date range parsed from user question. Format: {"since": "YYYY-MM-DD", "until": "YYYY-MM-DD"}. Examples: "Dec 1-15 2024" -> {"since": "2024-12-01", "until": "2024-12-15"}, "November 2024" -> {"since": "2024-11-01", "until": "2024-11-30"}, "last week" -> calculate dates accordingly.',
      required: true,
      visibility: 'user-or-llm',
    },
    total_infusion: {
      type: 'number',
      description:
        'Total money infused to Position2 Facebook account (e.g., 100000). This is the total budget from the sheet.',
      required: false,
      visibility: 'user-or-llm',
    },
    agency_cut_pct: {
      type: 'number',
      description:
        'Agency cut percentage to deduct from infusion. User configurable, default 0 (no cut).',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: () => '/api/facebook-ads/account-report',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: {
      time_range?: { since: string; until: string }
      total_infusion?: number
      agency_cut_pct?: number
    }) => ({
      // No accounts param - API defaults to ALL Position2 accounts
      time_range: params.time_range, // Agent parses from user question
      total_infusion: params.total_infusion, // Simple total from sheet
      agency_cut_pct: params.agency_cut_pct ?? 0, // Default 0 (no cut)
    }),
  },
  transformResponse: async (
    response: Response,
    params?: {
      time_range?: { since: string; until: string }
      total_infusion?: number
      agency_cut_pct?: number
    }
  ): Promise<FacebookAdsAccountReportResponse> => {
    try {
      logger.info('Processing Facebook Ads Account Report response', {
        status: response.status,
        timeRange: params?.time_range,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Facebook Ads Account Report request failed', {
          status: response.status,
          error: errorText,
        })
        throw new Error(
          `Facebook Ads Account Report request failed: ${response.status} - ${errorText}`
        )
      }

      const data = await response.json()
      logger.info('Facebook Ads Account Report successful', {
        accountsProcessed: data.accounts?.length || 0,
        totalSpend: data.summary?.total_spend,
        totalRemaining: data.summary?.total_remaining,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Facebook Ads Account Report execution failed', {
        error,
        timeRange: params?.time_range,
      })
      return {
        success: false,
        output: {} as FacebookAdsAccountReportOutput,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
