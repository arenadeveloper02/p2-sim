import { MetaIcon } from '@/components/icons'
import {
  isAdminWorkspace,
  resolveWorkspaceIdForAdminCheck,
} from '@/lib/workspaces/is-admin-workspace'
import type { BlockConfig } from '@/blocks/types'
import type { FacebookAdsQueryResponse } from '@/tools/facebook_ads/index'

const FACEBOOK_ADS_COND_NEVER = '__facebook_ads_cond_never__'

/** Show admin account dropdown fields (admin workspaces only). */
function facebookAdsAdminOnlyCondition(values?: Record<string, unknown>) {
  const isAdmin = isAdminWorkspace(resolveWorkspaceIdForAdminCheck(values))
  if (isAdmin) {
    return { field: 'query', value: FACEBOOK_ADS_COND_NEVER, not: true as const }
  }
  return { field: 'query', value: FACEBOOK_ADS_COND_NEVER }
}

/** Show explicit Facebook app credential fields (non-admin workspaces only). */
function facebookAdsNonAdminOnlyCondition(values?: Record<string, unknown>) {
  const isAdmin = isAdminWorkspace(resolveWorkspaceIdForAdminCheck(values))
  if (isAdmin) {
    return { field: 'query', value: FACEBOOK_ADS_COND_NEVER }
  }
  return { field: 'query', value: FACEBOOK_ADS_COND_NEVER, not: true as const }
}

export const FacebookAdsBlock: BlockConfig<FacebookAdsQueryResponse> = {
  type: 'facebook_ads',
  name: 'Facebook Ads',
  description: 'Query Facebook Ads data with natural language',
  longDescription:
    'Connect to Facebook Ads API and query campaign performance, ad set metrics, and account insights using natural language. Supports all 22 Position2 Facebook ad accounts with AI-powered query parsing.',
  docsLink: 'https://docs.sim.ai/blocks/facebook-ads',
  category: 'tools',
  bgColor: '#1877F2',
  icon: MetaIcon,
  subBlocks: [
    {
      id: 'fbClientId',
      title: 'FB Client ID',
      type: 'short-input',
      placeholder: 'Enter your Facebook app client ID',
      required: true,
      condition: facebookAdsNonAdminOnlyCondition,
    },
    {
      id: 'fbClientSecret',
      title: 'FB Client Secret',
      type: 'short-input',
      placeholder: 'Enter your Facebook app client secret',
      required: true,
      password: true,
      condition: facebookAdsNonAdminOnlyCondition,
    },
    {
      id: 'fbAccessToken',
      title: 'FB Access Token',
      type: 'short-input',
      placeholder: 'User or system user token with ads_read permission',
      required: true,
      password: true,
      condition: facebookAdsNonAdminOnlyCondition,
    },
    {
      id: 'accountId',
      title: 'Account ID',
      type: 'short-input',
      canonicalParamId: 'adAccountId',
      placeholder: 'Ad account ID (e.g. act_123456789)',
      required: true,
      condition: facebookAdsNonAdminOnlyCondition,
    },
    {
      id: 'account',
      title: 'Facebook Ad Account',
      type: 'dropdown',
      options: [],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/facebook-ads/accounts')
          const data = await response.json()

          if (data?.success && data.accounts && typeof data.accounts === 'object') {
            const accounts = data.accounts as Record<string, { id: string; name: string }>
            return Object.entries(accounts)
              .map(([key, account]) => ({
                id: key,
                label: account.name,
              }))
              .sort((a, b) => a.label.localeCompare(b.label))
          }
          return []
        } catch {
          return []
        }
      },
      placeholder: 'Select Facebook ad account',
      required: true,
      mode: 'basic',
      canonicalParamId: 'account',
      condition: facebookAdsAdminOnlyCondition,
    },
    {
      id: 'accountAdvanced',
      title: 'Facebook Ad Account',
      type: 'short-input',
      canonicalParamId: 'account',
      placeholder: 'Enter account key (e.g., ami, holm)',
      required: true,
      mode: 'advanced',
      condition: facebookAdsAdminOnlyCondition,
    },
    {
      id: 'query',
      title: 'Question / Query',
      type: 'long-input',
      placeholder: '<start.input>',
      description: 'Connect user input from Start block - user will chat with Agent',
      required: true,
    },
  ],
  tools: {
    access: ['facebook_ads_query'],
    config: {
      tool: () => 'facebook_ads_query',
      params: (params) => {
        const workspaceId = resolveWorkspaceIdForAdminCheck(
          params as Record<string, unknown> | undefined
        )
        const isAdmin = isAdminWorkspace(workspaceId)

        if (isAdmin) {
          return {
            account: params.account,
            query: params.query,
            workspaceId,
            _context: params._context,
          }
        }

        return {
          query: params.query,
          workspaceId,
          fbClientId: params.fbClientId,
          fbClientSecret: params.fbClientSecret,
          fbAccessToken: params.fbAccessToken,
          adAccountId: params.accountId ?? params.adAccountId ?? params.account,
          _context: params._context,
        }
      },
    },
  },
  inputs: {
    account: {
      type: 'string',
      description: 'Facebook ad account identifier',
    },
    query: {
      type: 'string',
      description: 'Natural language query from user chat',
    },
    fbClientId: { type: 'string', description: 'Facebook app client ID' },
    fbClientSecret: { type: 'string', description: 'Facebook app client secret' },
    fbAccessToken: { type: 'string', description: 'Facebook Marketing API access token' },
    accountId: { type: 'string', description: 'Facebook ad account ID (act_...)' },
    adAccountId: { type: 'string', description: 'Facebook ad account ID (act_...)' },
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
}
