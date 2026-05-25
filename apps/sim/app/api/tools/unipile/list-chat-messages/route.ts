import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveUnipileApiKeyFromRequestBody } from '@/lib/unipile/resolve-api-key-from-body'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListChatMessagesAPI')

const RequestSchema = z.object({
  chat_id: z.string().min(1, 'chat_id is required'),
})

/**
 * Proxies GET `/api/v1/chats/{chat_id}/messages` to Unipile.
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
    const message =
      keyError instanceof Error ? keyError.message : 'Unipile API key is not configured'
    const status =
      message.includes('not configured') || message.toLowerCase().includes('missing') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')

  try {
    const { chat_id } = RequestSchema.parse(body)
    const encoded = encodeURIComponent(chat_id.trim())
    const url = `${baseUrl}/api/v1/chats/${encoded}/messages`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile list chat messages failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        { error: responseText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    let data: unknown
    try {
      data = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON for list chat messages')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile list chat messages validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
