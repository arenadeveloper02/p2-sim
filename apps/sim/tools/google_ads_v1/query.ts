import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAdsV1Query')

interface GoogleAdsV1QueryParams {
  accounts?: string
  prompt: string
  _context?: {
    workspaceId?: string
  }
}

export const googleAdsV1QueryTool: ToolConfig<GoogleAdsV1QueryParams, unknown> = {
  id: 'google_ads_v1_query',
  name: 'Google Ads V1 Query',
  description:
    'Simplified Google Ads query tool that generates GAQL queries using AI (Grok with GPT-5 fallback). Just provide a natural language prompt and let AI handle the rest.',
  version: '1.0.0',

  params: {
    accounts: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Google Ads account key or numeric account ID (e.g. "ami", "gentle_dental", or "2497090182")',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Natural language prompt describing what data you want (e.g., "show campaign performance last 30 days")',
    },
    workspaceId: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'Workspace ID for account catalog routing',
    },
  },

  request: {
    url: () => '/api/google-ads-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GoogleAdsV1QueryParams) => ({
      query: params.prompt,
      accounts: typeof params.accounts === 'string' ? params.accounts.trim() : params.accounts,
      workspaceId: params._context?.workspaceId,
    }),
  },

  transformResponse: async (response: Response) => {
    try {
      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Response not ok', { status: response.status, errorText })
        throw new Error(
          `Google Ads V1 API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const data = await response.json()

      if (data.error || !data.success) {
        logger.error('API returned error', { error: data.error })
        throw new Error(`Google Ads V1 API error: ${data.error || 'Unknown error'}`)
      }

      const { cost, model, tokens, ...payload } = data

      return {
        success: true,
        output: {
          ...payload,
          ...(cost && typeof cost === 'object' ? { cost } : {}),
          ...(typeof model === 'string' ? { model } : {}),
          ...(tokens && typeof tokens === 'object' ? { tokens } : {}),
        },
      }
    } catch (error) {
      logger.error('Google Ads V1 query failed', { error: toError(error).message })

      return {
        success: false,
        error: toError(error).message,
      }
    }
  },
}
