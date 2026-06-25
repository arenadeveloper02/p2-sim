import { createLogger } from '@sim/logger'
import { IMAGE_GENERATION_PROVIDER_TIMEOUT_MS } from '@/lib/image-generation/constants'
import { openAIImageTool } from '@/tools/openai'
import type { ToolResponse } from '@/tools/types'
import { formatRequestParams } from '@/tools/utils'

const logger = createLogger('OpenAIImageGenerate')

/**
 * Generates an OpenAI image in-process with a direct fetch to the OpenAI API.
 * Avoids secureFetchWithPinnedIP and nested tool HTTP so server-side runs do not
 * inherit aborted internal fetch signals or DNS-pinned timeouts.
 */
export async function generateOpenAIImageToolResponse(
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const tool = openAIImageTool
  if (!tool.transformResponse) {
    throw new Error('OpenAI image tool missing transformResponse')
  }

  logger.info('Running OpenAI image generation in-process', {
    model: params.model,
    workflowId: (params._context as { workflowId?: string } | undefined)?.workflowId,
  })

  const requestParams = await formatRequestParams(tool, params as Record<string, unknown>)
  const response = await fetch(requestParams.url, {
    method: requestParams.method,
    headers: requestParams.headers,
    body: requestParams.body,
    signal: AbortSignal.timeout(IMAGE_GENERATION_PROVIDER_TIMEOUT_MS),
  })

  return tool.transformResponse(response, params as Record<string, unknown>)
}
