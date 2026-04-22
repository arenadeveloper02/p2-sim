import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileStartChatAPI')

const RequestSchema = z.object({
  account_id: z.string().min(1),
  text: z.string().min(1),
  attachments: z.string().optional(),
  voice_message: z.string().optional(),
  video_message: z.string().optional(),
  attendees_ids: z.string().optional(),
  subject: z.string().optional(),
  api: z.string().optional(),
  topic: z.string().optional(),
  applicant_id: z.string().optional(),
  invitation_id: z.string().optional(),
  inmail: z.union([z.boolean(), z.string()]).optional(),
})

function appendIfNonEmpty(form: FormData, key: string, value: string | undefined) {
  if (value !== undefined && value.trim() !== '') {
    form.append(key, value.trim())
  }
}

/**
 * Proxies POST `/api/v1/chats` to Unipile as multipart form data.
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

    const form = new FormData()
    form.append('account_id', data.account_id.trim())
    form.append('text', data.text)
    appendIfNonEmpty(form, 'attachments', data.attachments)
    appendIfNonEmpty(form, 'voice_message', data.voice_message)
    appendIfNonEmpty(form, 'video_message', data.video_message)
    appendIfNonEmpty(form, 'attendees_ids', data.attendees_ids)
    appendIfNonEmpty(form, 'subject', data.subject)
    form.append('api', (data.api ?? 'classic').trim())
    form.append('topic', (data.topic ?? 'service_request').trim())
    appendIfNonEmpty(form, 'applicant_id', data.applicant_id)
    appendIfNonEmpty(form, 'invitation_id', data.invitation_id)

    if (data.inmail !== undefined) {
      const flag =
        data.inmail === true ||
        (typeof data.inmail === 'string' && data.inmail.toLowerCase() === 'true')
      form.append('inmail', flag ? 'true' : 'false')
    }

    const url = `${baseUrl}/api/v1/chats`
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      body: form,
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile start chat failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        { error: responseText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON for start chat')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile start chat validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
