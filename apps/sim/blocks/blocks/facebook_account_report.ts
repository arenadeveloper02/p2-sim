import { MetaIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { FacebookAdsAccountReportResponse } from '@/tools/facebook_ads/index'

export const FacebookAccountReportBlock: BlockConfig<FacebookAdsAccountReportResponse> = {
  type: 'facebook_account_report',
  name: 'Facebook Account Report',
  description: 'Get spend report for all Position2 Facebook accounts',
  longDescription:
    'Generate a financial report for ALL Position2 Facebook Ads accounts showing money infused, money spent (live from Meta), and remaining balance. Agent decides the date range dynamically based on user question.',
  docsLink: 'https://docs.sim.ai/tools/facebook-account-report',
  category: 'tools',
  bgColor: '#1877F2',
  icon: MetaIcon,
  subBlocks: [],
  tools: {
    access: ['facebook_ads_account_report'],
    config: {
      tool: () => 'facebook_ads_account_report',
    },
  },
  inputs: {},
  outputs: {
    summary: {
      type: 'json',
      description: 'Summary totals (total_infusion, total_spend, total_remaining, etc.)',
    },
    accounts: {
      type: 'json',
      description: 'Per-account breakdown with spend, infusion, remaining amounts',
    },
    success: {
      type: 'boolean',
      description: 'Whether the report was generated successfully',
    },
  },
}
