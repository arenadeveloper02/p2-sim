import { getErrorMessage } from '@sim/utils/errors'
import { z } from 'zod'
import { getValidationErrorMessage } from '@/lib/api/server'
import { DEFAULT_MAX_JSON_BODY_BYTES } from '@/lib/api/server/validation'
import type { InternalToolOperationHandler } from '@/lib/internal/tool-operations/types'
import { executeBingAdsQuery } from '@/app/api/bing-ads/query/execute'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'

const bingAdsQueryInputSchema = z.object({
  query: z.string().min(1, 'No query provided').nullish(),
  account: z.string().min(1, 'No account provided').nullish(),
})

export const executeBingAdsTool: InternalToolOperationHandler = async (request) => {
  request.signal?.throwIfAborted()
  if (request.toolId !== 'bing_ads_query') {
    return Response.json({ error: `Unsupported Bing Ads tool: ${request.toolId}` }, { status: 500 })
  }

  let serializedInput: string
  try {
    serializedInput = JSON.stringify(request.input) ?? ''
  } catch {
    return Response.json({ error: 'Invalid request data' }, { status: 400 })
  }
  if (Buffer.byteLength(serializedInput, 'utf8') > DEFAULT_MAX_JSON_BODY_BYTES) {
    return Response.json(
      {
        error: `Request body exceeds the maximum allowed size of ${DEFAULT_MAX_JSON_BODY_BYTES} bytes`,
      },
      { status: 413 }
    )
  }

  const parsed = bingAdsQueryInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return Response.json(
      { error: getValidationErrorMessage(parsed.error, 'Invalid request data') },
      { status: 400 }
    )
  }

  try {
    const result = await executeBingAdsQuery(
      {
        query: parsed.data.query ?? '',
        account: parsed.data.account ?? '',
        workspaceId: request.context.workspaceId,
      },
      { signal: request.signal }
    )
    request.signal?.throwIfAborted()
    return Response.json(result.body, { status: result.status })
  } catch (error) {
    if (isAbortError(error) || request.signal?.aborted) throw error
    return Response.json(
      { error: getErrorMessage(error, 'Unknown error occurred') },
      { status: 500 }
    )
  }
}
