import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveUnipileApiKeyFromRequestBody } from '@/lib/unipile/resolve-api-key-from-body'

import { fetchAllUnipileUserRelationItems } from '@/tools/unipile/fetch_all_user_relations'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListUserRelationsAPI')

const optionalString = z.string().nullish()

const RequestSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  filter: optionalString,
})

/**
 * Proxies GET `/api/v1/users/relations` to Unipile, requesting every page until the cursor is exhausted.
 */
export async function POST(request: NextRequest) {
  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let apiKey: string
  let body: unknown
  try {
    body = await request.json()
    apiKey = resolveUnipileApiKeyFromRequestBody(body)
  } catch (keyError) {
    const message = keyError instanceof Error ? keyError.message : 'Unipile API key is not configured'
    const status =
      message.includes('not configured') || message.toLowerCase().includes('missing') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')

  try {
    const data = RequestSchema.parse(body)

    const { items, object, pagesFetched, truncated, stopReason } =
      await fetchAllUnipileUserRelationItems({
        baseUrl,
        apiKey,
        accountId: data.account_id.trim(),
        filter: data.filter,
      })

    return NextResponse.json({
      object,
      items,
      item_count: items.length,
      cursor: null,
      paging: null,
      fetch_all: true,
      pages_fetched: pagesFetched,
      truncated,
      truncation_reason:
        stopReason === 'max_pages' || stopReason === 'max_items' ? stopReason : null,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Unipile list user relations validation failed', { error })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Unipile request failed'
    logger.warn('Unipile list user relations failed', { message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
