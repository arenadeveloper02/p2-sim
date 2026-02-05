import { GoogleAnalyticsIcon } from '@/components/icons/google-analytics'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

export const GoogleAnalyticsBlock: BlockConfig<ToolResponse> = {
  type: 'google_analytics',
  name: 'Google Analytics',
  description: 'Query Google Analytics 4 data using natural language',
  icon: GoogleAnalyticsIcon,
  category: 'tools',
  bgColor: '#f9ab00',
  subBlocks: [],

  inputs: {
    query: {
      type: 'string',
      description: 'Natural language query for Google Analytics data',
    },
    property: {
      type: 'string',
      description: 'GA4 Property ID',
    },
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the query succeeded' },
    query: { type: 'string', description: 'Original natural language query' },
    results: { type: 'json', description: 'Query results from Google Analytics' },
    metadata: { type: 'json', description: 'Query metadata and statistics' },
  },

  tools: {
    access: ['google_analytics_query'],
    config: {
      tool: (params: Record<string, any>) => 'google_analytics_query',
    },
  },
}
