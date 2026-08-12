import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import type { ToolResponse, WorkflowToolExecutionContext } from '@/tools/types'

export interface AgentUiGenerateAppParams {
  userInput: string
  apiCurl?: string
  apiKey?: string
  repoName?: string
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
}

export interface AgentUiEditAppParams {
  userInput: string
  repoName: string
  apiCurl?: string
  apiKey?: string
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
}

export interface AgentUiGenerateAppResponse extends ToolResponse {
  output: {
    content: string
    appName: string | null
    repoName: string | null
    description: string | null
    features: string[] | null
    outputPath: string | null
    absoluteOutputPath: string | null
    fileCount: number | null
    buildValidated: boolean | null
    buildOutput: string | null
    apiWired: boolean | null
    hasDatabase: boolean | null
    previewHtml: string | null
    previewPath: string | null
    /** Overall tool price (= summed LLM cost). */
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

export type AgentUiEditAppResponse = AgentUiGenerateAppResponse
