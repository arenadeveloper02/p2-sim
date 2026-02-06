import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('BingAdsQuery')

interface BingAdsQueryParams {
  account: string
  query: string
}

interface BingAdsAccount {
  id: string
  name: string
}

export const bingAdsQueryTool: ToolConfig<BingAdsQueryParams, any> = {
  id: 'bing_ads_query',
  version: '1.0.0',
  name: 'Bing Ads Query',
  description:
    'Query Microsoft Advertising (Bing Ads) API for campaign performance, ad metrics, and account insights using natural language. Supports all Position2 Bing Ads accounts.',
  params: {
    account: {
      type: 'string',
      description: 'Bing Ads account identifier',
      required: true,
      visibility: 'user-or-llm',
    },
    query: {
      type: 'string',
      description: 'Natural language query about Bing Ads data',
      required: true,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: () => '/api/bing-ads-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: BingAdsQueryParams) => ({
      account: params.account,
      query: params.query,
    }),
  },
  transformResponse: async (response: Response, params?: BingAdsQueryParams) => {
    try {
      logger.info('Processing Bing Ads response', {
        status: response.status,
        account: params?.account,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Bing Ads API request failed', {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Bing Ads API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Bing Ads query successful', {
        account: params?.account,
        dataLength: data.data?.length || 0,
      })

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Bing Ads query execution failed', { error, account: params?.account })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
