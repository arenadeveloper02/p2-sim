import { AgentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { GTM_AGENT_SYSTEM_PROMPT } from '@/lib/prompts/gtm-agent'
import type { ToolResponse } from '@/tools/types'

interface GTMAgentResponse extends ToolResponse {
  output: {
    content: string
    metrics?: {
      totalRevenue: number
      roas: number
      cac: number
      cpl: number
      mer: number
    }
    model: string
    tokens?: {
      prompt?: number
      completion?: number
      total?: number
    }
  }
}

export const GTMAgentBlock: BlockConfig<GTMAgentResponse> = {
  type: 'gtm_agent',
  name: 'GTM Metrics Agent',
  description: 'CEO-focused marketing performance analysis agent',
  longDescription:
    'The GTM Metrics Agent is a specialized AI agent that analyzes Google Ads performance data and provides executive-level insights. It focuses on business outcomes like revenue, ROAS, growth, and strategic recommendations rather than vanity metrics.',
  docsLink: 'https://docs.sim.ai/blocks/gtm-agent',
  category: 'blocks',
  bgColor: '#10B981',
  icon: AgentIcon,
  subBlocks: [
    {
      id: 'question',
      title: 'CEO Question',
      type: 'long-input',
      layout: 'full',
      placeholder: 'e.g., "Show me our Q3 marketing ROI" or "Which accounts should we invest more in?"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are helping a CEO formulate questions about marketing performance. Generate clear, executive-level questions that focus on business outcomes.

### GOOD CEO QUESTIONS:
- "Show me our marketing ROI for Q3"
- "Which accounts are performing best and why?"
- "Are we hitting our revenue targets?"
- "Should we increase budget for top performers?"
- "What's our customer acquisition cost trend?"
- "Which accounts are at risk and need attention?"

### AVOID:
- Technical questions about clicks, CTR, Quality Score
- Individual campaign-level details
- Questions about ad copy or keywords

Generate a CEO-level question based on the user's request.`,
        placeholder: 'What would you like to know about marketing performance?',
      },
    },
    {
      id: 'timeframe',
      title: 'Time Period',
      type: 'dropdown',
      layout: 'half',
      placeholder: 'Select time period...',
      required: true,
      options: [
        { label: 'Last 7 Days', id: 'last_7_days' },
        { label: 'Last 30 Days', id: 'last_30_days' },
        { label: 'This Month', id: 'this_month' },
        { label: 'Last Month', id: 'last_month' },
        { label: 'This Quarter', id: 'this_quarter' },
        { label: 'Last Quarter', id: 'last_quarter' },
        { label: 'This Year', id: 'this_year' },
        { label: 'Last Year', id: 'last_year' },
        { label: 'Custom Range', id: 'custom' },
      ],
      defaultValue: 'this_month',
    },
    {
      id: 'accounts',
      title: 'Accounts',
      type: 'dropdown',
      layout: 'half',
      placeholder: 'Select accounts...',
      required: true,
      options: [
        { label: 'All Accounts (Portfolio View)', id: 'all' },
        { label: 'Top Performers Only', id: 'top_performers' },
        { label: 'Specific Account', id: 'specific' },
      ],
      defaultValue: 'all',
    },
    {
      id: 'customStartDate',
      title: 'Start Date',
      type: 'short-input',
      layout: 'half',
      placeholder: 'YYYY-MM-DD',
      condition: {
        field: 'timeframe',
        value: ['custom'],
      },
    },
    {
      id: 'customEndDate',
      title: 'End Date',
      type: 'short-input',
      layout: 'half',
      placeholder: 'YYYY-MM-DD',
      condition: {
        field: 'timeframe',
        value: ['custom'],
      },
    },
    {
      id: 'includeComparison',
      title: 'Include Period Comparison',
      type: 'dropdown',
      layout: 'half',
      placeholder: 'Compare with...',
      options: [
        { label: 'No Comparison', id: 'none' },
        { label: 'Previous Period', id: 'previous' },
        { label: 'Same Period Last Year', id: 'yoy' },
      ],
      defaultValue: 'previous',
    },
    {
      id: 'focusMetrics',
      title: 'Focus Metrics',
      type: 'dropdown',
      layout: 'half',
      placeholder: 'What to emphasize...',
      options: [
        { label: 'Revenue & ROAS', id: 'revenue' },
        { label: 'Growth Trends', id: 'growth' },
        { label: 'Efficiency (CAC, CPL)', id: 'efficiency' },
        { label: 'Account Performance', id: 'accounts' },
        { label: 'All Metrics', id: 'all' },
      ],
      defaultValue: 'all',
    },
    {
      id: 'systemPrompt',
      title: 'System Prompt (Advanced)',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Custom system prompt (optional)',
      rows: 5,
      mode: 'advanced',
      defaultValue: GTM_AGENT_SYSTEM_PROMPT,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      layout: 'half',
      placeholder: 'Select AI model...',
      required: true,
      options: [
        { label: 'GPT-4o (Recommended)', id: 'gpt-4o' },
        { label: 'GPT-4o-mini', id: 'gpt-4o-mini' },
        { label: 'Claude 3.5 Sonnet', id: 'claude-3-5-sonnet-20241022' },
        { label: 'Claude 3.7 Sonnet', id: 'claude-3-7-sonnet-20250219' },
      ],
      defaultValue: 'gpt-4o',
      mode: 'advanced',
    },
    {
      id: 'temperature',
      title: 'Temperature',
      type: 'slider',
      layout: 'half',
      min: 0,
      max: 1,
      defaultValue: 0.3,
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['gtm_metrics_agent'],
    config: {
      tool: () => 'gtm_metrics_agent',
      params: (params: Record<string, any>) => {
        return {
          question: params.question,
          timeframe: params.timeframe,
          accounts: params.accounts,
          customStartDate: params.customStartDate,
          customEndDate: params.customEndDate,
          includeComparison: params.includeComparison,
          focusMetrics: params.focusMetrics,
          systemPrompt: params.systemPrompt || GTM_AGENT_SYSTEM_PROMPT,
          model: params.model || 'gpt-4o',
          temperature: params.temperature || 0.3,
        }
      },
    },
  },
  inputs: {
    question: { type: 'string', description: 'CEO question about marketing performance' },
    timeframe: { type: 'string', description: 'Time period for analysis' },
    accounts: { type: 'string', description: 'Which accounts to analyze' },
    customStartDate: { type: 'string', description: 'Custom start date (YYYY-MM-DD)' },
    customEndDate: { type: 'string', description: 'Custom end date (YYYY-MM-DD)' },
    includeComparison: { type: 'string', description: 'Period comparison type' },
    focusMetrics: { type: 'string', description: 'Which metrics to emphasize' },
    systemPrompt: { type: 'string', description: 'Agent system prompt' },
    model: { type: 'string', description: 'AI model to use' },
    temperature: { type: 'number', description: 'Response creativity level' },
  },
  outputs: {
    content: { type: 'string', description: 'Executive analysis and recommendations' },
    metrics: { type: 'json', description: 'Calculated GTM metrics' },
    model: { type: 'string', description: 'Model used for generation' },
    tokens: { type: 'any', description: 'Token usage statistics' },
  },
}
