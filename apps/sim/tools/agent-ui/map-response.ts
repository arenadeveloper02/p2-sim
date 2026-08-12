import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import { buildToolLlmCostFromModelUsage } from '@/lib/billing/core/tool-llm-cost'
import { formatBuildErrorsSummary } from '@/lib/development/format-generated-app-build-errors'
import type { GenerateNextjsAppResult } from '@/lib/development/nextjs-app-generator'
import type { AgentUiGenerateAppResponse } from '@/tools/agent-ui/types'

type AgentUiResultWithBilling = GenerateNextjsAppResult & {
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

function resolveBillingFields(data: AgentUiResultWithBilling) {
  if (data.cost && typeof data.cost.total === 'number') {
    return {
      cost: data.cost,
      ...(typeof data.model === 'string' ? { model: data.model } : {}),
      ...(data.tokens ? { tokens: data.tokens } : {}),
      ...(data.llmUsage ? { llmUsage: data.llmUsage } : {}),
    }
  }
  return buildToolLlmCostFromModelUsage(data.llmUsage)
}

function emptyOutput(
  data: AgentUiResultWithBilling,
  content: string
): AgentUiGenerateAppResponse['output'] {
  const billing = resolveBillingFields(data)
  return {
    content,
    appName: data.appName ?? null,
    repoName: data.repoName ?? null,
    description: data.description ?? null,
    features: Array.isArray(data.features) ? data.features : null,
    outputPath: data.outputPath ?? null,
    absoluteOutputPath: data.absoluteOutputPath ?? null,
    fileCount: data.fileCount ?? null,
    buildValidated: data.buildValidated ?? null,
    buildOutput: data.buildOutput ?? null,
    apiWired: data.apiWired ?? null,
    hasDatabase: data.hasDatabase ?? null,
    previewHtml: data.previewHtml ?? null,
    previewPath: data.previewPath ?? null,
    ...(billing ?? {}),
  }
}

/**
 * Maps generator / API result JSON into the Agent UI tool response shape.
 */
export function mapAgentUiResultToToolResponse(
  data: AgentUiResultWithBilling
): AgentUiGenerateAppResponse {
  if (!data.success) {
    const wroteFiles =
      (data.fileCount ?? 0) > 0 && Boolean(data.outputPath || data.absoluteOutputPath)
    const pathHint = data.absoluteOutputPath ?? data.outputPath
    const buildErrorSummary = data.buildOutput ? formatBuildErrorsSummary(data.buildOutput) : ''
    const buildErrorsLabel = buildErrorSummary ? `\n\nBuild errors:\n${buildErrorSummary}` : ''
    const baseError = data.error ?? 'Failed to generate Agent UI app'
    return {
      success: false,
      output: emptyOutput(
        data,
        wroteFiles
          ? `Wrote ${data.fileCount} files to ${pathHint}, but generation failed: ${baseError}${buildErrorsLabel}`
          : `${baseError}${buildErrorsLabel}`
      ),
      error: data.error,
    }
  }

  const features = Array.isArray(data.features) ? data.features : []
  const pathHint = data.absoluteOutputPath ?? data.outputPath
  const pathLabel = pathHint ? ` at ${pathHint}` : ''
  const buildLabel = data.buildValidated
    ? ' Build validation passed.'
    : data.buildOutput
      ? ` Build validation: ${data.buildOutput}`
      : ''
  const apiLabel = data.apiWired
    ? ' Workflow API wired via app/api/run.'
    : ' No workflow API wired.'
  const previewLabel = data.previewPath ? ` Open ${data.previewPath} to preview the UI.` : ''
  const actionLabel = data.mode === 'edit' ? 'Updated' : 'Generated'
  const appNameLabel = data.appName?.trim() || 'app'
  const fileCountLabel = typeof data.fileCount === 'number' ? data.fileCount : 0

  return {
    success: true,
    output: emptyOutput(
      { ...data, features },
      `${actionLabel} "${appNameLabel}" (${fileCountLabel} files)${pathLabel}.${buildLabel}${apiLabel}${previewLabel}`
    ),
  }
}
