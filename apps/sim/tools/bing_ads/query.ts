import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { filterUndefined } from '@sim/utils/object'
import type { InternalToolConfig } from '@/tools/types'

const logger = createLogger('BingAdsQuery')

interface BingAdsQueryParams {
  account: string
  query: string
}

export const bingAdsQueryTool: InternalToolConfig<BingAdsQueryParams, unknown> = {
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
    workspaceId: {
      type: 'string',
      description: 'Workspace ID used to scope the visible Bing Ads account catalog',
      required: false,
      visibility: 'hidden',
    },
  },
  operation: {
    modelInput: {
      mode: 'project',
      select: (params) => ({ query: params.query }),
    },
    input: (params) =>
      filterUndefined({
        query: params.query ?? undefined,
        account: params.account ?? undefined,
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
        error: getErrorMessage(error, 'Unknown error occurred'),
      }
    }
  },
}
