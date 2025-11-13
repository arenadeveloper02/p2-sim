import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

interface GA4Response extends ToolResponse {
  output: {
    response: string
    data: any[]
    summary: {
      totalRows: number
      dateRange: string
      propertyId: string
    }
    query: any
  }
}

export const GA4Block: BlockConfig<GA4Response> = {
  type: 'ga4',
  name: 'GA4 Analytics',
  description: 'Query Google Analytics 4 data using natural language',
  longDescription:
    'The GA4 Analytics block allows you to query Google Analytics 4 data using natural language. Ask questions about traffic, conversions, events, ecommerce, engagement, and more. The block will generate and execute GA4 Data API queries automatically.',
  docsLink: 'https://docs.sim.ai/blocks/ga4',
  category: 'tools',
  bgColor: '#E37400',
  icon: GoogleIcon,
  subBlocks: [
    {
      id: 'query',
      title: 'Query',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Ask a question about your GA4 data (e.g., "Show me traffic by source for last 30 days")',
      rows: 3,
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are a Google Analytics 4 expert. Help the user formulate their GA4 analytics question.

### CONTEXT
{context}

### INSTRUCTIONS
Create a clear, specific GA4 analytics query based on the user's request.

### EXAMPLES
- "Show me sessions by device category for last 30 days"
- "What are my top 10 pages by pageviews this month?"
- "Compare conversions by channel this week vs last week"
- "Show me event counts by event name for last 7 days"
- "What's my bounce rate by country for last month?"

### OUTPUT
Return only the query text, no explanations.`,
      },
    },
    {
      id: 'propertyId',
      title: 'Property ID',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter GA4 Property ID (e.g., 123456789)',
    },
  ],
  tools: {
    access: ['ga4'],
    config: {
      tool: () => 'ga4',
      params: (params: any) => ({
        query: params.query,
        propertyId: params.propertyId,
      }),
    },
  },
  inputs: {
    query: { type: 'string', description: 'User question about GA4 analytics data' },
    propertyId: { type: 'string', description: 'GA4 Property ID' },
  },
  outputs: {
    response: { type: 'string', description: 'Formatted GA4 analytics report' },
    data: { type: 'json', description: 'Raw GA4 data rows' },
    summary: { type: 'json', description: 'Summary information' },
    query: { type: 'json', description: 'Generated GA4 query' },
  },
}
