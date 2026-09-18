import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import type { ToolResponse, WorkflowToolExecutionContext } from '@/tools/types'

export interface AgentFrontGenerateAppParams {
  userInput: string
  uiMode?: string
  combineMode?: string
  repoName?: string
  api1Name?: string
  api1Curl?: string
  api1Key?: string
  api2Name?: string
  api2Curl?: string
  api2Key?: string
  api3Name?: string
  api3Curl?: string
  api3Key?: string
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
}

export interface AgentFrontEditAppParams extends AgentFrontGenerateAppParams {
  repoName: string
}

export interface AgentFrontGenerateAppResponse extends ToolResponse {
  output: {
    content: string
    appName: string | null
    repoName: string | null
    description: string | null
    features: string[] | null
    outputPath: string | null
    absoluteOutputPath: string | null
    fileCount: number | null
    uiMode: string | null
    combineMode: string | null
    apiCount: number | null
    apis: Array<{ name: string; slug: string; wired: boolean }> | null
    previewHtml: string | null
    previewPath: string | null
    cost?: {
      input: number
      output: number
      total: number
    }
    model?: string
    tokens?: {
      input: number
      output: number
      total: number
    }
    llmUsage?: ModelUsageByModel
  }
}
