import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('FacebookAdsQuery')

interface FacebookAdsQueryParams {
  account?: string
  query: string
  workspaceId?: string
  fbClientId?: string
  fbClientSecret?: string
  fbAccessToken?: string
  accountId?: string
  adAccountId?: string
  _context?: {
    workspaceId?: string
    workflowId?: string
    userId?: string
  }
}

export const facebookAdsQueryTool: ToolConfig<FacebookAdsQueryParams, unknown> = {
  id: 'facebook_ads_query',
  version: '1.0.0',
  name: 'Facebook Ads Query',
  description:
    'Query Facebook Ads API for campaign performance, ad set metrics, and account insights using natural language. Supports all Position2 Facebook ad accounts.',
  params: {
    account: {
      type: 'string',
      description: 'Facebook ad account key (admin workspaces only)',
      required: false,
      visibility: 'user-or-llm',
    },
    query: {
      type: 'string',
      description: 'Natural language query about Facebook Ads data',
      required: true,
      visibility: 'user-or-llm',
    },
    workspaceId: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'Workspace ID for admin vs user credential routing',
    },
    fbClientId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Facebook app client ID (non-admin workspaces)',
    },
    fbClientSecret: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Facebook app client secret (non-admin workspaces)',
    },
    fbAccessToken: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description:
        'User or system user access token with ads_read or ads_management (non-admin workspaces)',
    },
    accountId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Facebook ad account ID (non-admin workspaces)',
    },
    adAccountId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Facebook ad account ID (non-admin workspaces)',
    },
  },
  request: {
    url: () => '/api/facebook-ads/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: FacebookAdsQueryParams) => ({
      account: params.account,
      query: params.query,
      workspaceId: params.workspaceId ?? params._context?.workspaceId,
      fbClientId: params.fbClientId,
      fbClientSecret: params.fbClientSecret,
      fbAccessToken: params.fbAccessToken,
      accountId: params.accountId,
      adAccountId: params.accountId ?? params.adAccountId,
    }),
  },
  transformResponse: async (response: Response, params?: FacebookAdsQueryParams) => {
    try {
      logger.info('Processing Facebook Ads response', {
        status: response.status,
        account: params?.account ?? params?.adAccountId,
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
        account: params?.account ?? params?.adAccountId,
        dataLength: data.data?.length || 0,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Facebook Ads query execution failed', {
        error: toError(error).message,
        account: params?.account ?? params?.adAccountId,
      })
      return {
        success: false,
        error: toError(error).message,
      }
    }
  },
}

export type FacebookAdsQueryResponse = {
  success: boolean
  output: {
    data: Array<Record<string, unknown>>
    account_id: string
    account_name: string
    query: string
    endpoint?: string
    date_preset?: string
    level?: string
  }
  error?: string
}
