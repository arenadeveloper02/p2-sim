import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAdsV1Query')

function resolveGoogleAdsAccountId(params: GoogleAdsV1QueryParams): string | undefined {
  for (const value of [params.accountId, params.customerId]) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value)
    }
  }
  return undefined
}

interface GoogleAdsV1QueryParams {
  accounts?: string
  prompt: string
  workspaceId?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  accountId?: string
  customerId?: string
  developerToken?: string
  managerCustomerId?: string
  _context?: {
    workspaceId?: string
    workflowId?: string
    userId?: string
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
    clientId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google OAuth client ID (non-admin workspaces)',
    },
    clientSecret: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google OAuth client secret (non-admin workspaces)',
    },
    refreshToken: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Google OAuth refresh token (non-admin workspaces)',
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

  request: {
    url: () => '/api/google-ads-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GoogleAdsV1QueryParams) => {
      const accountId = resolveGoogleAdsAccountId(params)
      return {
        query: params.prompt,
        accounts: params.accounts,
        workspaceId: params.workspaceId ?? params._context?.workspaceId,
        clientId: params.clientId,
        clientSecret: params.clientSecret,
        refreshToken: params.refreshToken,
        accountId,
        customerId: accountId,
        developerToken: params.developerToken,
        managerCustomerId: params.managerCustomerId,
      }
    },
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

      return {
        success: true,
        output: data,
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
