import type { ToolResponse } from '@/tools/types'

/**
 * Parameters for the self-hosted Playwright browser agent.
 */
export interface PlaywrightRunTaskParams {
  task: string
  apiKey: string
  model: string
  startUrl?: string
  variables?: Record<string, string> | Array<Record<string, unknown>>
  allowedDomains?: string | string[]
  maxSteps?: number
  structuredOutput?: string
}

/**
 * One recorded agent step for audit/debug.
 */
export interface PlaywrightAgentStep {
  number: number
  action: string
  detail?: string
  url: string
  error?: string
}

/**
 * Output payload for the Playwright browser agent tool.
 */
export interface PlaywrightRunTaskOutput {
  success: boolean
  output: unknown
  url: string | null
  steps: PlaywrightAgentStep[]
}

export interface PlaywrightRunTaskResponse extends ToolResponse {
  output: PlaywrightRunTaskOutput
}

export type PlaywrightResponse = PlaywrightRunTaskResponse
