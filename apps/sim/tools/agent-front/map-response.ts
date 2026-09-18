import type { GenerateAgentFrontAppResult } from '@/lib/agent-front/generate-app'
import { buildToolLlmCostFromModelUsage } from '@/lib/billing/core/tool-llm-cost'
import type { AgentFrontGenerateAppResponse } from '@/tools/agent-front/types'

/**
 * Maps Agent Front generator results into the tool response shape.
 */
export function mapAgentFrontResultToToolResponse(
  data: GenerateAgentFrontAppResult
): AgentFrontGenerateAppResponse {
  const billing = buildToolLlmCostFromModelUsage(data.llmUsage)

  if (!data.success) {
    return {
      success: false,
      output: {
        content: data.error ?? 'Failed to generate Agent Front app',
        appName: data.appName ?? null,
        repoName: data.repoName ?? null,
        description: data.description ?? null,
        features: Array.isArray(data.features) ? data.features : null,
        outputPath: data.outputPath ?? null,
        absoluteOutputPath: data.absoluteOutputPath ?? null,
        fileCount: data.fileCount ?? null,
        uiMode: data.uiMode ?? null,
        combineMode: data.combineMode ?? null,
        apiCount: data.apiCount ?? null,
        apis: Array.isArray(data.apis) ? data.apis : null,
        previewHtml: data.previewHtml ?? null,
        previewPath: data.previewPath ?? null,
        ...(billing ?? {}),
      },
      error: data.error,
    }
  }

  return {
    success: true,
    output: {
      content: data.content ?? 'Agent Front app generated',
      appName: data.appName ?? null,
      repoName: data.repoName ?? null,
      description: data.description ?? null,
      features: Array.isArray(data.features) ? data.features : [],
      outputPath: data.outputPath ?? null,
      absoluteOutputPath: data.absoluteOutputPath ?? null,
      fileCount: data.fileCount ?? null,
      uiMode: data.uiMode ?? null,
      combineMode: data.combineMode ?? null,
      apiCount: data.apiCount ?? null,
      apis: Array.isArray(data.apis) ? data.apis : [],
      previewHtml: data.previewHtml ?? null,
      previewPath: data.previewPath ?? null,
      ...(billing ?? {}),
    },
  }
}
