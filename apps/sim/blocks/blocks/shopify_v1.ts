import { ShopifyIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'

interface ShopifyV1Response {
  success: boolean
  error?: string
  output: Record<string, unknown>
}

export const ShopifyV1Block: BlockConfig<ShopifyV1Response> = {
  type: 'shopify_v1',
  name: 'Shopify V1',
  description: 'AI-powered Shopify analytics and natural language queries',
  authMode: AuthMode.OAuth,
  longDescription:
    'Advanced Shopify integration with AI-powered natural language queries. Get sales analytics, product insights, customer data, and business intelligence using simple conversational queries. Compare performance across time periods, track trends, and generate comprehensive reports.',
  docsLink: 'https://docs.sim.ai/tools/shopify-v1',
  category: 'tools',
  icon: ShopifyIcon,
  bgColor: '#FFFFFF',
  subBlocks: [
    {
      id: 'query',
      title: 'Natural Language Query',
      type: 'long-input',
      placeholder: 'e.g., "Show me sales from January 2025 vs February 2025" or "What are my top performing products this month?"',
      required: true,
    },
    {
      id: 'shopDomain',
      title: 'Shop Domain',
      type: 'short-input',
      placeholder: 'your-store.myshopify.com',
      required: true,
    },
    {
      id: 'credential',
      title: 'Shopify Account',
      type: 'oauth-input',
      serviceId: 'shopify',
      requiredScopes: [
        'read_products',
        'read_orders',
        'read_customers',
        'read_inventory',
        'read_locations',
        'read_reports',
      ],
      placeholder: 'Select Shopify account',
      required: true,
    },
    {
      id: 'queryType',
      title: 'Query Type',
      type: 'dropdown',
      options: [
        { label: 'Auto-detect', id: 'auto' },
        { label: 'Sales Analytics', id: 'sales' },
        { label: 'Product Performance', id: 'products' },
        { label: 'Customer Insights', id: 'customers' },
        { label: 'Order Analysis', id: 'orders' },
        { label: 'Inventory Status', id: 'inventory' },
        { label: 'Comparison', id: 'comparison' },
      ],
      value: () => 'auto',
    },
    {
      id: 'dateRange',
      title: 'Date Range',
      type: 'dropdown',
      options: [
        { label: 'Auto-detect from query', id: 'auto' },
        { label: 'Last 7 days', id: '7d' },
        { label: 'Last 30 days', id: '30d' },
        { label: 'This month', id: 'this_month' },
        { label: 'Last month', id: 'last_month' },
        { label: 'This year', id: 'this_year' },
        { label: 'Custom', id: 'custom' },
      ],
      value: () => 'auto',
    },
    {
      id: 'limit',
      title: 'Result Limit',
      type: 'dropdown',
      options: [
        { label: '10 results', id: '10' },
        { label: '25 results', id: '25' },
        { label: '50 results', id: '50' },
        { label: '100 results', id: '100' },
        { label: 'All results', id: 'all' },
      ],
      value: () => '50',
    },
    {
      id: 'includeTotals',
      title: 'Include Summary Statistics',
      type: 'switch',
      value: () => 'true',
    },
    {
      id: 'format',
      title: 'Output Format',
      type: 'dropdown',
      options: [
        { label: 'JSON', id: 'json' },
        { label: 'Table', id: 'table' },
        { label: 'Summary', id: 'summary' },
      ],
      value: () => 'json',
    },
  ],
  tools: {
    access: [
      'shopify_v1_query',
    ],
    config: {
      tool: (params) => {
        return 'shopify_v1_query'
      },
      params: (params) => {
        if (!params.query?.trim()) {
          throw new Error('Query is required.')
        }
        if (!params.shopDomain?.trim()) {
          throw new Error('Shop domain is required.')
        }
        if (!params.credential?.trim()) {
          throw new Error('Shopify credential is required.')
        }

        return {
          query: params.query.trim(),
          shopDomain: params.shopDomain.trim(),
          credential: params.credential,
          queryType: params.queryType || 'auto',
          dateRange: params.dateRange || 'auto',
          limit: params.limit || '50',
          includeTotals: params.includeTotals !== false,
          format: params.format || 'json',
        }
      },
    },
  },
  inputs: {
    query: { type: 'string', description: 'Natural language query for Shopify data' },
    shopDomain: { type: 'string', description: 'Shopify store domain' },
    credential: { type: 'string', description: 'Shopify OAuth credential' },
    queryType: { type: 'string', description: 'Type of query (auto, sales, products, etc.)' },
    dateRange: { type: 'string', description: 'Date range for the query' },
    limit: { type: 'string', description: 'Number of results to return' },
    includeTotals: { type: 'boolean', description: 'Include summary statistics' },
    format: { type: 'string', description: 'Output format (json, table, summary)' },
  },
  outputs: {
    data: { type: 'json', description: 'Shopify query results' },
    totals: { type: 'json', description: 'Summary statistics' },
    graphql: { type: 'json', description: 'Generated GraphQL query' },
    metadata: { type: 'json', description: 'Query metadata and execution info' },
    success: { type: 'boolean', description: 'Query execution success status' },
  },
}
