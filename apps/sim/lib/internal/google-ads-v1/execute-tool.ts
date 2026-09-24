import { getErrorMessage } from '@sim/utils/errors'
import { z } from 'zod'
import { getValidationErrorMessage } from '@/lib/api/server'
import { DEFAULT_MAX_JSON_BODY_BYTES } from '@/lib/api/server/validation'
import type { InternalToolOperationHandler } from '@/lib/internal/tool-operations/types'
import { executeGoogleAdsV1Query } from '@/app/api/google-ads-v1/query/execute'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'

const googleAdsV1QueryInputSchema = z.object({
  query: z.string().min(1, 'No query provided'),
  accounts: z.string().optional(),
  accessToken: z.string().optional(),
  accountId: z.string().optional(),
  customerId: z.string().optional(),
  developerToken: z.string().optional(),
  managerCustomerId: z.string().optional(),
})

export const executeGoogleAdsV1Tool: InternalToolOperationHandler = async (request) => {
  request.signal?.throwIfAborted()
  if (request.toolId !== 'google_ads_v1_query') {
    return Response.json(
      { error: `Unsupported Google Ads V1 tool: ${request.toolId}` },
      { status: 500 }
    )
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

  const parsed = googleAdsV1QueryInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return Response.json(
      { error: getValidationErrorMessage(parsed.error, 'Invalid request data') },
      { status: 400 }
    )
  }

  try {
    const result = await executeGoogleAdsV1Query(
      {
        ...parsed.data,
        workspaceId: request.context.workspaceId,
        userId: request.context.userId,
      },
      { requestId: request.requestId, signal: request.signal }
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
