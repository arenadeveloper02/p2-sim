import type { ToolConfig } from '@/tools/types'

export interface ShopifyV1QueryParams {
  query: string
  shopDomain: string
  accessToken: string
  queryType?: string
  dateRange?: string
  limit?: string
  includeTotals?: boolean
  format?: string
}

export interface ShopifyV1QueryResponse {
  success: boolean
  data: any[]
  totals: Record<string, number>
  graphql: {
    query: string
    queryType: string
    entitiesUsed: string[]
    fieldsUsed: string[]
  }
  metadata: {
    rowCount: number
    totalRows: number
    execution_time_ms: number
  }
  shop: {
    domain: string
  }
}

export const shopifyV1QueryTool: ToolConfig<
  ShopifyV1QueryParams,
  ShopifyV1QueryResponse
> = {
  id: 'shopify_v1_query',
  name: 'Shopify V1 Query',
  description: 'Execute AI-powered natural language queries against Shopify data',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'shopify',
  },

  params: {
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural language query for Shopify data (e.g., "Show me sales from January 2025")',
    },
    shopDomain: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Your Shopify store domain (e.g., mystore.myshopify.com)',
    },
    queryType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Type of query (auto, sales, products, customers, orders, inventory, comparison)',
    },
    dateRange: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Date range for the query (auto, 7d, 30d, this_month, last_month, this_year, custom)',
    },
    limit: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of results to return (10, 25, 50, 100, all)',
    },
    includeTotals: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Include summary statistics in the response',
    },
    format: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Output format (json, table, summary)',
    },
  },

  request: {
    url: (params) => `/api/shopify-v1/query`,
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.accessToken}`,
    }),
    body: (params) => ({
      query: params.query,
      shopDomain: params.shopDomain,
      queryType: params.queryType,
      dateRange: params.dateRange,
      limit: params.limit,
      includeTotals: params.includeTotals,
      format: params.format,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Shopify V1 query failed')
    }

    return {
      success: data.success,
      data: data.data,
      totals: data.totals,
      graphql: data.graphql,
      metadata: data.metadata,
      shop: data.shop,
    }
  },
}
