/**
 * Google Analytics Block
 * AI-powered Google Analytics query block - Following Google Ads v1 pattern
 */

import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

// Google Analytics properties configuration
export const GOOGLE_ANALYTICS_PROPERTIES: Record<string, { id: string; name: string; displayName: string }> = {
  website_property: { id: '123456789', name: 'Main Website', displayName: 'Main Website Analytics' },
  app_property: { id: '987654321', name: 'Mobile App', displayName: 'Mobile App Analytics' },
  // Add your GA4 properties here
}

export const GoogleAnalyticsBlock: BlockConfig<ToolResponse> = {
  type: 'google_analytics',
  name: 'Google Analytics',
  description: 'AI-powered Google Analytics query tool',
  longDescription:
    'Google Analytics block that uses AI (Grok with GPT-4o fallback) to automatically generate queries from natural language prompts. Perfect for quick queries without complex configuration.',
  docsLink: 'https://docs.sim.ai/tools/google-analytics',
  category: 'tools',
  bgColor: '#34a853',
  icon: GoogleIcon,
  subBlocks: [
    // Google Analytics Property (basic mode - dropdown)
    {
      id: 'property',
      title: 'Google Analytics Property',
      type: 'dropdown',
      options: Object.entries(GOOGLE_ANALYTICS_PROPERTIES).map(([key, property]) => ({
        label: property.displayName,
        id: key,
        value: key,
      })),
      placeholder: 'Select property...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'property',
    },
    // Google Analytics Property (advanced mode - text input)
    {
      id: 'propertyAdvanced',
      title: 'Google Analytics Property',
      type: 'short-input',
      canonicalParamId: 'property',
      placeholder: 'Enter property key (e.g., website_property)',
      required: true,
      mode: 'advanced',
    },
    {
      id: 'prompt',
      title: 'Natural Language Query',
      type: 'long-input',
      placeholder:
        'Describe what data you want in plain English, e.g., "show sessions by country last 7 days", "top landing pages this month", "users by device type"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Google Analytics query assistant. Help users create effective natural language prompts for Google Analytics data.`,
      },
    },
  ],
  inputs: {
    property: {
      type: 'string',
      description: 'Google Analytics property key',
    },
    question: {
      type: 'string',
      description: 'Your question about Google Analytics data',
    },
  },
  outputs: {
    data: {
      type: 'json',
      description: 'Google Analytics query results with dimensions and metrics',
    },
    row_count: {
      type: 'number',
      description: 'Total number of rows returned',
    },
    totals: {
      type: 'json',
      description: 'Aggregated metrics totals',
    },
  },
  tools: {
  access: ['google_analytics'],
},
}
