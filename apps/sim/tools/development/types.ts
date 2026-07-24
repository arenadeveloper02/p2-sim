import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import type { ToolResponse, WorkflowToolExecutionContext } from '@/tools/types'

export interface DevelopmentGenerateAppParams {
  userInput: string
  repoName?: string
  privateRepo?: boolean
  referenceImage?: object
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
}

export interface DevelopmentEditAppParams {
  userInput: string
  repoName: string
  referenceImage?: object
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
}

export interface DevelopmentGenerateAppResponse extends ToolResponse {
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
    gitPushed: boolean | null
    githubHtmlUrl: string | null
    githubCloneUrl: string | null
    githubOwner: string | null
    githubRepoName: string | null
    gitPushError: string | null
    vercelDeployed: boolean | null
    vercelUrl: string | null
    vercelDeploymentUrl: string | null
    vercelProjectId: string | null
    vercelDeploymentId: string | null
    vercelInspectorUrl: string | null
    vercelDeployError: string | null
    requiresDatabase: boolean | null
    databaseProvisioned: boolean | null
    neonProjectId: string | null
    databaseProvisionError: string | null
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
    /** Per-model token breakdown. */
    llmUsage?: ModelUsageByModel
  }
}

export type DevelopmentEditAppResponse = DevelopmentGenerateAppResponse
