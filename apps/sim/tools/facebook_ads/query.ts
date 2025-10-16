import type { ToolConfig } from '@/tools/types'

export interface FacebookAdsQueryParams {
  account: string
  query: string
  date_preset?: string
  time_range?: { since: string; until: string }
  fields?: string[]
  level?: string
}

export interface FacebookAdsQueryResponse {
  success: boolean
  output: {
    data: any
    account_id: string
    account_name: string
    query: string
  }
  error?: string
  requestId?: string
  timestamp?: string
}

export const facebookAdsQueryTool: ToolConfig<
  FacebookAdsQueryParams,
  FacebookAdsQueryResponse
> = {
  id: 'facebook_ads_query',
  name: 'Facebook Ads Query',
  description:
    'Query Facebook Ads data using natural language. Get campaign performance, ad set metrics, and account insights.',
  version: '1.0.0',

  params: {
    account: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Facebook ad account identifier',
    },
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural language query for Facebook Ads data',
    },
    date_preset: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Date preset (last_30d, last_7d, etc.)',
    },
    time_range: {
      type: 'object',
      required: false,
      visibility: 'user-only',
      description: 'Custom time range {since: YYYY-MM-DD, until: YYYY-MM-DD}',
    },
    fields: {
      type: 'array',
      required: false,
      visibility: 'user-only',
      description: 'Specific fields to retrieve',
    },
    level: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Aggregation level (account, campaign, adset, ad)',
    },
  },

  outputs: {
    data: {
      type: 'json',
      description: 'Facebook Ads performance data',
    },
    account_id: {
      type: 'string',
      description: 'Facebook ad account ID',
    },
    account_name: {
      type: 'string',
      description: 'Facebook ad account name',
    },
    query: {
      type: 'string',
      description: 'Original query',
    },
  },

  request: {
    url: '/api/facebook-ads/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      account: params.account,
      query: params.query,
      date_preset: params.date_preset,
      time_range: params.time_range,
      fields: params.fields,
      level: params.level,
    }),
  },

  transformResponse: async (response: Response): Promise<FacebookAdsQueryResponse> => {
    const data = await response.json()

    return {
      success: data.success || false,
      data: data.data,
      error: data.error,
      requestId: data.requestId,
      account_id: data.account_id,
      account_name: data.account_name,
      query: data.query,
      timestamp: data.timestamp,
      output: {
        data: data.data,
        account_id: data.account_id,
        account_name: data.account_name,
        query: data.query,
      },
    } as any
  },
}
