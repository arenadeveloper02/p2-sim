import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GTMMetricsAgent')

// Placeholder logger - actual logging happens in the API route
function createLogger(name: string) {
  return {
    info: (...args: any[]) => console.log(`[${name}]`, ...args),
    error: (...args: any[]) => console.error(`[${name}]`, ...args),
  }
}

interface GTMAgentParams {
  question: string
  timeframe: string
  accounts: string
  customStartDate?: string
  customEndDate?: string
  includeComparison?: string
  focusMetrics?: string
  systemPrompt?: string
  model?: string
  temperature?: number
}

interface GTMAgentResponse {
  success: boolean
  output: string
  metrics?: any
  error?: string
}

export const gtmMetricsAgentTool: ToolConfig<GTMAgentParams, GTMAgentResponse> = {
  id: 'gtm_metrics_agent',
  name: 'GTM Metrics Agent',
  description: 'CEO-focused marketing performance analysis with GTM metrics',
  version: '1.0.0',

  params: {
    question: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'CEO question about marketing performance',
    },
    timeframe: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Time period for analysis',
    },
    accounts: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Which accounts to analyze',
    },
    customStartDate: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Custom start date (YYYY-MM-DD)',
    },
    customEndDate: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Custom end date (YYYY-MM-DD)',
    },
    includeComparison: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Period comparison type',
    },
    focusMetrics: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Which metrics to emphasize',
    },
    systemPrompt: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Agent system prompt',
    },
    model: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'AI model to use',
    },
    temperature: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Response creativity level',
    },
  },

  request: {
    url: () => '/api/ceo-metrics/analyze',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GTMAgentParams) => ({
      question: params.question,
      timeframe: params.timeframe,
      accounts: params.accounts,
      customStartDate: params.customStartDate,
      customEndDate: params.customEndDate,
      includeComparison: params.includeComparison,
      focusMetrics: params.focusMetrics,
      systemPrompt: params.systemPrompt,
      model: params.model,
      temperature: params.temperature,
    }),
  },
}
