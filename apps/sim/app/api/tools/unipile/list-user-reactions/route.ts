import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveUnipileApiKeyFromRequestBody } from '@/lib/unipile/resolve-api-key-from-body'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListUserReactionsAPI')

const RequestSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  user_identifier: z.string().min(1),
  cursor: z.string().optional(),
})

/**
 * Proxies GET `/api/v1/users/{identifier}/reactions` to Unipile.
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
    apiKey = await resolveUnipileApiKeyFromRequestBody(body)
  } catch (keyError) {
    const message =
      keyError instanceof Error ? keyError.message : 'Unipile API key is not configured'
    const status =
      message.includes('not configured') || message.toLowerCase().includes('missing') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')

  try {
    const body = await request.json()
    const { account_id, user_identifier, cursor } = RequestSchema.parse(body)
    const encoded = encodeURIComponent(user_identifier.trim())
    const params = new URLSearchParams()
    params.set('account_id', account_id.trim())
    if (cursor?.trim()) {
      params.set('cursor', cursor.trim())
    }
    const qs = params.toString()
    const url = `${baseUrl}/api/v1/users/${encoded}/reactions${qs ? `?${qs}` : ''}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile list user reactions failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        { error: responseText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    try {
      return NextResponse.json(JSON.parse(responseText) as unknown)
    } catch {
      logger.error('Unipile returned non-JSON for list user reactions')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile list user reactions validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
