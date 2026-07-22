import { runChartGenerate } from '@/lib/chart-generation/run-chart-generate'
import type { ToolConfig, ToolResponse } from '@/tools/types'

export interface ChartGenerateParams {
  userRequest: string
  data?: unknown
  model?: string
  temperature?: number
  skills?: unknown
  systemPrompt?: string
  userPrompt?: string
  apiKey?: string
  azureEndpoint?: string
  azureApiVersion?: string
  vertexProject?: string
  vertexLocation?: string
  vertexCredential?: string
  bedrockAccessKeyId?: string
  bedrockSecretKey?: string
  bedrockRegion?: string
  _context?: { userId?: string; workspaceId?: string; workflowId?: string }
}

export interface ChartGenerateResponse extends ToolResponse {
  output: {
    charts: unknown[]
    count: number
    valid: boolean
    skipped: boolean
    dashboard: { charts: unknown[]; count: number }
    content: string
    model: string
    tokens: { input: number; output: number; total: number }
    cost: { input: number; output: number; total: number }
  }
}

/**
 * Agent-callable chart generation. Runs the same LLM flow as the standalone
 * Chart Generator block (shared runChartGenerate): answers in text, produces
 * ECharts JSON when a chart is requested, or both. Chat surfaces render the
 * resulting chart from the returned `content`/`charts`.
 *
 * LLM-facing params are `userRequest` and `data`; model/credentials/prompts are
 * user-only and supplied from the block config via tools.config.params.
 */
export const chartGenerateTool: ToolConfig<ChartGenerateParams, ChartGenerateResponse> = {
  id: 'chart_generate',
  name: 'Generate Chart',
  description:
    'Answer a data question in text and, when a visualization is requested, generate valid ECharts JSON from the provided data. Returns { charts, content } for chat rendering.',
  version: '1.0.0',

  // Only the two inputs the agent's LLM fills are declared here. Everything else
  // (model, temperature, skills, prompts, provider credentials) is supplied by the
  // Chart Generator block's own config via tools.config.params and passed straight
  // through to runChartGenerate — no need to re-declare the block's fields here.
  params: {
    userRequest: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural language request describing the analysis and/or chart to produce',
    },
    data: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Source data to visualize (JSON or tabular text)',
    },
  },

  directExecution: async (params: ChartGenerateParams): Promise<ChartGenerateResponse> => {
    const ctx = params._context ?? {}
    const result = await runChartGenerate(params as Record<string, unknown>, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      workflowId: ctx.workflowId,
    })
    return { success: true, output: result }
  },

  outputs: {
    charts: { type: 'json', description: 'ECharts option objects (array)' },
    dashboard: { type: 'json', description: '{ charts, count } payload for chat rendering' },
    count: { type: 'number', description: 'Number of charts' },
    valid: { type: 'boolean', description: 'True when at least one chart was produced' },
    skipped: { type: 'boolean', description: 'True when the response is plain text (no chart)' },
    content: { type: 'string', description: 'Text answer and/or chart JSON in one response' },
    model: { type: 'string', description: 'Model used' },
    tokens: { type: 'json', description: 'Token usage' },
    cost: { type: 'json', description: 'Cost breakdown' },
  },
}
