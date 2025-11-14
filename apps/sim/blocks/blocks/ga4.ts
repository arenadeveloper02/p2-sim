import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

// GA4 Properties configuration
const GA4_PROPERTIES = {
  acalvio: { id: '336427429', name: 'Acalvio - GA4' },
  al_fire: { id: '108820304', name: 'Al Fire' },
  altula: { id: '30134064', name: 'Altula' },
  aptc: { id: '44022520', name: 'APTC' },
  arena_calibrate: { id: '198007515', name: 'ArenaCalibrate' },
  armor_analytics: { id: '37140580', name: 'Armor Analytics' },
  au_eventgroove: { id: '10334305', name: 'AU - eventgroove.com.au' },
  bared: { id: '112717872', name: 'BARED' },
  build_n_care: { id: '48593548', name: 'Build N Care' },
  ca_eventgroove: { id: '28973577', name: 'CA - eventgroove.ca' },
  capitalcitynurses: { id: '35460305', name: 'Capitalcitynurses.com' },
  care_advantage: { id: '112973226', name: 'Care Advantage' },
  chancey_reynolds: { id: '188026798', name: 'Chancey & Reynolds (New)' },
  covalent_metrology: { id: '173920588', name: 'Covalent Metrology' },
  drip_capital: { id: '54624908', name: 'Drip Capital' },
  englert_leafguard: { id: '15161193', name: 'Englert LeafGuard' },
  epstein_jeffrey_1: { id: '19992251', name: 'Epstein, Jeffrey' },
  epstein_jeffrey_2: { id: '15990503', name: 'Epstein, Jeffrey' },
  etc_group: { id: '169034142', name: 'ETC Group' },
  floor_tools: { id: '197252857', name: 'FloorTools' },
  garramone_new: { id: '253446859', name: 'Garramone NEW' },
  gentle_dental: { id: '2300720', name: 'Gentle Dental' },
  great_lakes_corp: { id: '151578158', name: 'Great Lakes Corp' },
  gtm_leader_society: { id: '366055823', name: 'GTM leader society' },
  healthrhythms: { id: '71580287', name: 'healthrhythms' },
  howell_chase: { id: '341778160', name: 'Howell-Chase Heating & Air Conditioning' },
  inc_media: { id: '98096820', name: 'Inc. media' },
  inspire_aesthetics: { id: '288674034', name: 'Inspire Aesthetics' },
}

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
      id: 'properties',
      title: 'GA4 Property',
      type: 'dropdown',
      layout: 'full',
      options: Object.entries(GA4_PROPERTIES).map(([key, property]) => ({
        label: property.name,
        id: key,
        value: property.id,
      })),
      placeholder: 'Select property...',
      required: true,
    },
    {
      id: 'question',
      title: 'Question / Query',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Ask any question about GA4 data, e.g., "Show me traffic by source for last 30 days", "What are my top pages this month?", "Compare conversions this week vs last week"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Google Analytics 4 expert. Help users create effective questions for GA4 data analysis.

### EXAMPLES OF GOOD QUESTIONS
- "Show me sessions by device category for last 30 days"
- "What are my top 10 pages by pageviews this month?"
- "Compare conversions by channel this week vs last week"
- "Show me event counts by event name for last 7 days"
- "What's my bounce rate by country for last month?"
- "Show me ecommerce revenue by product for last 15 days"

### AVAILABLE METRICS
- Sessions, Users, Pageviews, Bounce Rate
- Conversions, Revenue, Transactions
- Engagement Rate, Session Duration
- Event Counts, Active Users

### TIME PERIODS
- Last 7/15/30 days
- This/Last month, This/Last week
- Yesterday, Today
- Specific date ranges

Generate a clear, specific question about GA4 analytics based on the user's request.`,
      },
    },
  ],
  tools: {
    access: ['ga4'],
    config: {
      tool: () => 'ga4',
      params: (params: any) => {
        // If properties is a key (like 'acalvio'), look up the ID
        const propertyKey = params.properties as string
        const propertyId = GA4_PROPERTIES[propertyKey as keyof typeof GA4_PROPERTIES]?.id || propertyKey
        return {
          query: params.question,
          propertyId: propertyId,
        }
      },
    },
  },
  inputs: {
    question: { type: 'string', description: 'User question about GA4 analytics data' },
    properties: { type: 'string', description: 'Selected GA4 property' },
  },
  outputs: {
    response: { type: 'string', description: 'Formatted GA4 analytics report' },
    data: { type: 'json', description: 'Raw GA4 data rows' },
    summary: { type: 'json', description: 'Summary information' },
    query: { type: 'json', description: 'Generated GA4 query' },
  },
}
