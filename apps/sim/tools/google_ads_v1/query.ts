import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { filterUndefined } from '@sim/utils/object'
import type { InternalToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAdsV1Query')

interface GoogleAdsV1QueryParams {
  accounts?: string
  prompt: string
  accessToken?: string
  accountId?: string
  customerId?: string
  developerToken?: string
  managerCustomerId?: string
}

export const googleAdsV1QueryTool: InternalToolConfig<GoogleAdsV1QueryParams, unknown> = {
  id: 'google_ads_v1_query',
  name: 'Google Ads V1 Query',
  description:
    'Simplified Google Ads query tool that generates GAQL queries using AI (Grok with GPT-5 fallback). Just provide a natural language prompt and let AI handle the rest.',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-ads',
  },

  params: {
    accounts: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Google Ads account key (admin workspaces only)',
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
      description: 'Workspace ID for admin vs user credential routing',
    },
    oauthCredential: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google Ads OAuth credential (non-admin workspaces)',
    },
    accessToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'OAuth access token for the Google Ads API',
    },
    accountId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google Ads account ID (non-admin workspaces)',
    },
    customerId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google Ads customer ID (non-admin workspaces)',
    },
    developerToken: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google Ads API developer token (non-admin workspaces)',
    },
    managerCustomerId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Manager account customer ID (non-admin workspaces, optional)',
    },
  },

  operation: {
    modelInput: {
      mode: 'project',
      select: (params) => ({ prompt: params.prompt }),
    },
    input: (params) =>
      filterUndefined({
        query: params.prompt,
        accounts: params.accounts,
        accessToken: params.accessToken,
        accountId: params.accountId,
        customerId: params.customerId,
        developerToken: params.developerToken,
        managerCustomerId: params.managerCustomerId,
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
