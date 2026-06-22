import type { ToolResponse } from '@/tools/types'

export interface SkyvernBaseParams {
  apiKey?: string
  baseUrl?: string
}

export interface SkyvernCreateWorkflowParams extends SkyvernBaseParams {
  title: string
  description?: string
  blockLabel?: string
  url: string
  navigationGoal?: string
  dataExtractionGoal?: string
  prompt?: string
  workflowParameters?: unknown
}

export interface SkyvernCreateWorkflowResponse extends ToolResponse {
  output: {
    workflowId: string | null
    workflowPermanentId: string | null
    title: string | null
    description: string | null
    status: string | null
    version: number | null
    agentId: string | null
  }
}

export interface SkyvernListWorkflowsParams extends SkyvernBaseParams {
  page?: number
  pageSize?: number
  status?: string
  searchKey?: string
}

export interface SkyvernWorkflowSummary {
  workflowId: string
  workflowPermanentId: string
  title: string
  description: string | null
  status: string | null
  version: number | null
  agentId: string | null
  createdAt: string | null
  modifiedAt: string | null
}

export interface SkyvernListWorkflowsResponse extends ToolResponse {
  output: {
    workflows: SkyvernWorkflowSummary[]
    count: number
  }
}

export interface SkyvernRunWorkflowParams extends SkyvernBaseParams {
  workflowPermanentId: string
  parameters?: Record<string, unknown>
  title?: string
}

export interface SkyvernRunWorkflowResponse extends ToolResponse {
  output: {
    workflowId: string | null
    workflowRunId: string | null
    status: string | null
    agentId: string | null
    agentRunId: string | null
  }
}

export interface SkyvernGetRunParams extends SkyvernBaseParams {
  runId: string
}

export interface SkyvernGetRunResponse extends ToolResponse {
  output: {
    runId: string | null
    status: string | null
    output: Record<string, unknown> | null
    failureReason: string | null
    downloadedFiles: unknown[]
    recordingUrl: string | null
    screenshotUrls: string[] | null
    createdAt: string | null
    startedAt: string | null
    finishedAt: string | null
    appUrl: string | null
    stepCount: number | null
    runType: string | null
  }
}
