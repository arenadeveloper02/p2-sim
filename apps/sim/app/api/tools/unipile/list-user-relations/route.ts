import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
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

  const apiKey = env.UNIPILE_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'UNIPILE_API_KEY is not configured' }, { status: 503 })
  }

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')

  try {
    const body = await request.json()
    const data = RequestSchema.parse(body)

    const { items, object } = await fetchAllUnipileUserRelationItems({
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
