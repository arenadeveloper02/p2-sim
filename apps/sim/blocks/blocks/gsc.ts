/**
 * Google Search Console Block
 * Handles GSC search analytics queries with basic and advanced modes
 */

import { SearchIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const GSCBlock: BlockConfig<any> = {
  type: 'gsc',
  name: 'Google Search Console',
  description: 'Query Google Search Console search analytics data and performance metrics',
  longDescription:
    'The Google Search Console block allows you to query comprehensive search performance data including clicks, impressions, CTR, and average position. Supports flexible date ranges, site filtering, and various query types including search queries, landing pages, devices, and countries.',
  docsLink: 'https://docs.sim.ai/tools/gsc',
  category: 'tools',
  bgColor: '#4285f4',
  icon: SearchIcon,
  subBlocks: [
    // GSC Site (basic mode - dropdown)
    {
      id: 'site',
      title: 'GSC Site',
      type: 'dropdown',
      options: [
        // Static fallback options
        { label: 'Example Site', id: 'example' },
        { label: 'Blog Site', id: 'blog' },
        { label: 'Shop Site', id: 'shop' },
      ],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/gsc/accounts')
          const data = await response.json()
          
          if (data.success && data.accounts) {
            return data.accounts.map((account: any) => ({
              label: account.name,
              id: account.id
            }))
          }
          
          // Fallback to static options
          return [
            { label: 'Example Site', id: 'example' },
            { label: 'Blog Site', id: 'blog' },
            { label: 'Shop Site', id: 'shop' },
          ]
        } catch (error) {
          console.error('Failed to fetch GSC accounts:', error)
          // Return static fallback options
          return [
            { label: 'Example Site', id: 'example' },
            { label: 'Blog Site', id: 'blog' },
            { label: 'Shop Site', id: 'shop' },
          ]
        }
      },
      fetchOptionById: async (id: string) => {
        try {
          const response = await fetch('/api/gsc/accounts')
          const data = await response.json()
          
          if (data.success && data.accounts) {
            const account = data.accounts.find((acc: any) => acc.id === id)
            return account ? { label: account.name, id: account.id } : null
          }
          
          return null
        } catch (error) {
          console.error('Failed to fetch GSC account by ID:', error)
          return null
        }
      },
      placeholder: 'Select GSC site...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'site',
    },
    // GSC Site (advanced mode - text input)
    {
      id: 'siteAdvanced',
      title: 'GSC Site',
      type: 'short-input',
      canonicalParamId: 'site',
      placeholder: 'Enter site property (e.g., sc-domain:example.com)',
      required: true,
      mode: 'advanced',
    },
    // Query
    {
      id: 'query',
      title: 'Query',
      type: 'short-input',
      placeholder: 'Enter your search analytics query (e.g., "show top queries last 7 days")',
      required: true,
    },
  ],
  tools: {
    access: ['gsc_query'],
    config: {
      tool: () => 'gsc_query',
      params: (params) => ({
        site: params.site,
        query: params.query,
      }),
    },
  },
  inputs: {
    site: { type: 'string', description: 'GSC site property' },
    query: { type: 'string', description: 'Search analytics query' },
  },
  outputs: {
    data: { type: 'json', description: 'Search analytics data rows' },
    totals: { type: 'json', description: 'Aggregated metrics' },
    row_count: { type: 'number', description: 'Number of results returned' },
  },
}
