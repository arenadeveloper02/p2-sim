import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileGetMessageAttachmentAPI')

const RequestSchema = z.object({
  message_id: z.string().min(1),
  attachment_id: z.string().min(1),
})

/**
 * Proxies GET `/api/v1/messages/{message_id}/attachments/{attachment_id}` to Unipile.
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
    const { message_id, attachment_id } = RequestSchema.parse(body)
    const mid = encodeURIComponent(message_id.trim())
    const aid = encodeURIComponent(attachment_id.trim())
    const url = `${baseUrl}/api/v1/messages/${mid}/attachments/${aid}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'X-API-KEY': apiKey,
      },
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      logger.warn('Unipile get message attachment failed', {
        status: upstream.status,
        snippet: errText.slice(0, 500),
      })
      return NextResponse.json(
        { error: errText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    const mimeType = upstream.headers.get('content-type') ?? ''
    const buffer = Buffer.from(await upstream.arrayBuffer())

    if (mimeType.includes('text/') || mimeType.includes('application/json')) {
      return NextResponse.json({
        content: buffer.toString('utf8'),
        mime_type: mimeType || null,
        content_base64: null as string | null,
      })
    }

    return NextResponse.json({
      content: null as string | null,
      mime_type: mimeType || null,
      content_base64: buffer.toString('base64'),
    })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile get message attachment validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
