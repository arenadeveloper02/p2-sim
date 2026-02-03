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
      options: [
        // Static fallback options
        { label: '42 North Dental', id: '42_north_dental' },
        { label: 'AMI', id: 'ami' },
        { label: 'AUHI', id: 'auhi' },
        { label: 'Acalvio Technologies', id: 'acalvio' },
        { label: 'Capital City Nurses', id: 'capital_city_nurses' },
      ],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/facebook-ads/accounts')
          const data = await response.json()
          
          console.log('Facebook Ads API response:', data)
          
          if (data.success && data.accounts) {
            const accounts = data.accounts as Record<string, { id: string; name: string }>
            const options = Object.entries(accounts).map(([key, account]) => ({
              id: key,
              label: account.name
            }))
            console.log('Facebook Ads options:', options)
            return options
          }
          console.log('Facebook Ads: No success or no accounts')
          return []
        } catch (error) {
          console.error('Failed to fetch Facebook accounts:', error)
          return []
        }
      },
      fetchOptionById: async (optionId: string) => {
        try {
          const response = await fetch('/api/facebook-ads/accounts')
          const data = await response.json()
          
          if (data.success && data.accounts[optionId]) {
            const account = data.accounts[optionId] as { id: string; name: string }
            return {
              id: optionId,
              label: account.name
            }
          }
          return null
        } catch (error) {
          console.error('Failed to fetch Facebook account:', error)
          return null
        }
      },
      placeholder: 'Select Facebook ad account...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'account',
    },
    // Facebook Ads Account (advanced mode - text input)
    {
      id: 'accountAdvanced',
      title: 'Facebook Ads Account',
      type: 'short-input',
      canonicalParamId: 'account',
      placeholder: 'Enter account ID (e.g., 493502549491904, 172016712813696096)',
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
