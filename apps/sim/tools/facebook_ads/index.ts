import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

export type {
  AccountReportRow,
  AccountReportSummary,
  FacebookAdsAccountReportOutput,
  FacebookAdsAccountReportResponse,
} from './account-report'
export { facebookAdsAccountReportTool } from './account-report'

const logger = createLogger('FacebookAdsQuery')

export const facebookAdsQueryTool: ToolConfig = {
  id: 'facebook_ads_query',
  version: '1.0.0',
  name: 'Facebook Ads Query',
  description:
    'Query Facebook Ads API for campaign performance, ad set metrics, and account insights using natural language. Supports all Position2 Facebook ad accounts.',
  params: {
    account: {
      type: 'string',
      description: 'Facebook ad account identifier',
      required: true,
      visibility: 'user-or-llm',
    },
    query: {
      type: 'string',
      description: 'Natural language query about Facebook Ads data',
      required: true,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: () => '/api/facebook-ads/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: { account: string; query: string }) => ({
      account: params.account,
      query: params.query,
    }),
  },
  transformResponse: async (response: Response, params?: { account: string; query: string }) => {
    try {
      logger.info('Processing Facebook Ads response', {
        status: response.status,
        account: params?.account,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Facebook Ads API request failed', {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Facebook Ads API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Facebook Ads query successful', {
        account: params?.account,
        dataLength: data.data?.length || 0,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Facebook Ads query execution failed', { error, account: params?.account })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}

export type FacebookAdsQueryResponse = {
  success: boolean
  output: {
    data: Array<Record<string, any>>
    account_id: string
    account_name: string
    query: string
    endpoint?: string
    date_preset?: string
    level?: string
  }
  error?: string
}
