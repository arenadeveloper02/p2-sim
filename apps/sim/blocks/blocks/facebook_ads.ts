import { MetaIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { FacebookAdsQueryResponse } from '@/tools/facebook_ads/index'

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
      id: 'account',
      title: 'Facebook Ad Account',
      type: 'dropdown',
      options: [],
      fetchOptions: async (_blockId: string, _subBlockId: string) => {
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
        } catch (error) {
          console.error('Failed to fetch Facebook Ads accounts:', error)
          return []
        }
      },
      placeholder: 'Select Facebook ad account...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'account',
    },
    {
      id: 'accountAdvanced',
      title: 'Facebook Ad Account',
      type: 'short-input',
      canonicalParamId: 'account',
      placeholder: 'Enter account key (e.g., ami, holm)',
      required: true,
      mode: 'advanced',
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
      params: (params) => ({
        account: params.account,
        query: params.query,
      }),
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
