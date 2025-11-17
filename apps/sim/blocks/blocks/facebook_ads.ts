import { MetaIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { FacebookAdsQueryResponse } from '@/tools/facebook_ads'

export const FacebookAdsBlock: BlockConfig<FacebookAdsQueryResponse> = {
  type: 'facebook_ads',
  name: 'Facebook Ads',
  description: 'Query Facebook Ads data with natural language',
  longDescription:
    'Connect to Facebook Ads API and query campaign performance, ad set metrics, and account insights using natural language. Supports all 22 Position2 Facebook ad accounts with AI-powered query parsing.',
  docsLink: 'https://docs.sim.ai/blocks/facebook-ads',
  category: 'blocks',
  bgColor: '#1877F2',
  icon: MetaIcon,
  subBlocks: [
    {
      id: 'account',
      title: 'Facebook Ad Account',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: '42 North Dental', id: '42_north_dental' },
        { label: 'AMI', id: 'ami' },
        { label: 'AUHI', id: 'auhi' },
        { label: 'Acalvio Technologies', id: 'acalvio' },
        { label: 'Capital City Nurses', id: 'capital_city_nurses' },
        { label: 'Care Advantage', id: 'care_advantage' },
        { label: 'Eventgroove', id: 'eventgroove' },
        { label: 'Great Hill Dental Partners', id: 'great_hill_dental' },
        { label: 'HEART HOLM', id: 'heart_holm' },
        { label: 'HOLM', id: 'holm' },
        { label: 'Health Rhythms', id: 'health_rhythms' },
        { label: 'IDI', id: 'idi' },
        { label: 'MSRN', id: 'msrn' },
        { label: 'NHI', id: 'nhi' },
        { label: 'ODC AL', id: 'odc_al' },
        { label: 'OIA', id: 'oia' },
        { label: 'SMI', id: 'smi' },
        { label: 'Silver Lining Home Healthcare', id: 'silver_lining' },
        { label: 'UCONN', id: 'uconn' },
        { label: 'UD', id: 'ud' },
        { label: 'UVA', id: 'uva' },
        { label: 'WFBI', id: 'wfbi' },
        { label: 'Youngs Healthcare, Inc.', id: 'youngs_healthcare' },
      ],
      placeholder: 'Select Facebook ad account...',
      required: true,
    },
    {
      id: 'query',
      title: 'Question / Query',
      type: 'long-input',
      layout: 'full',
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
