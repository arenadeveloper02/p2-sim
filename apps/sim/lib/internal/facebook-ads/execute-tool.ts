import { getErrorMessage } from '@sim/utils/errors'
import { z } from 'zod'
import { getValidationErrorMessage } from '@/lib/api/server'
import { DEFAULT_MAX_JSON_BODY_BYTES } from '@/lib/api/server/validation'
import type { InternalToolOperationHandler } from '@/lib/internal/tool-operations/types'
import { executeFacebookAdsQuery } from '@/app/api/facebook-ads/query/execute'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'

const facebookAdsQueryInputSchema = z.object({
  query: z.string().min(1, 'Missing required field: query').nullish(),
  account: z.string().nullish(),
  accessToken: z.string().nullish(),
  accountId: z.string().nullish(),
  adAccountId: z.string().nullish(),
  date_preset: z.string().nullish(),
  time_range: z.object({ since: z.string(), until: z.string() }).nullish(),
  fields: z.array(z.string()).nullish(),
  level: z.string().nullish(),
})

export const executeFacebookAdsTool: InternalToolOperationHandler = async (request) => {
  request.signal?.throwIfAborted()
  if (request.toolId !== 'facebook_ads_query') {
    return Response.json(
      { error: `Unsupported Facebook Ads tool: ${request.toolId}` },
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

  const parsed = facebookAdsQueryInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return Response.json(
      { error: getValidationErrorMessage(parsed.error, 'Invalid request data') },
      { status: 400 }
    )
  }

  try {
    const result = await executeFacebookAdsQuery(
      {
        query: parsed.data.query ?? '',
        account: parsed.data.account ?? undefined,
        accessToken: parsed.data.accessToken ?? undefined,
        accountId: parsed.data.accountId ?? undefined,
        adAccountId: parsed.data.adAccountId ?? undefined,
        date_preset: parsed.data.date_preset ?? undefined,
        time_range: parsed.data.time_range ?? undefined,
        fields: parsed.data.fields ?? undefined,
        level: parsed.data.level ?? undefined,
        workspaceId: request.context.workspaceId,
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
