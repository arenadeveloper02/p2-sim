import type { ToolConfig } from '@/tools/types'

interface GA4QueryParams {
  query: string
  propertyId: string
  credentials?: any
}

/**
 * GA4 Analytics Tool
 * Queries Google Analytics 4 data using natural language
 */
export const ga4Tool: ToolConfig<GA4QueryParams> = {
  id: 'ga4',
  name: 'GA4 Analytics',
  description: 'Query Google Analytics 4 data using natural language',
  version: '1.0.0',
  
  params: {
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural language question about GA4 analytics data',
    },
    propertyId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'GA4 Property ID',
    },
  },

  request: {
    url: () => '/api/ga4/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GA4QueryParams) => ({
      query: params.query,
      propertyId: params.propertyId,
      credentials: params.credentials,
    }),
  },
}
