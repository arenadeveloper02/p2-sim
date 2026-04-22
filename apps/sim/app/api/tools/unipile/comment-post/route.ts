import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileCommentPostAPI')

const RequestSchema = z.object({
  post_id: z.string().min(1),
  account_id: z.string().min(1),
  text: z.string().min(1),
  name: z.string().optional(),
  profile_id: z.string().optional(),
  is_company: z.string().optional(),
  external_link: z.string().optional(),
  as_organization: z.string().optional(),
  comment_id: z.string().optional(),
  attachments: z.string().optional(),
})

function appendIfNonEmpty(form: FormData, key: string, value: string | undefined) {
  if (value !== undefined && value.trim() !== '') {
    form.append(key, value.trim())
  }
}

/**
 * Proxies POST `/api/v1/posts/{post_id}/comments` to Unipile as multipart form data.
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
    appendIfNonEmpty(form, 'name', data.name)
    appendIfNonEmpty(form, 'profile_id', data.profile_id)
    appendIfNonEmpty(form, 'is_company', data.is_company)
    appendIfNonEmpty(form, 'external_link', data.external_link)
    appendIfNonEmpty(form, 'as_organization', data.as_organization)
    appendIfNonEmpty(form, 'comment_id', data.comment_id)
    appendIfNonEmpty(form, 'attachments', data.attachments)

    const encoded = encodeURIComponent(data.post_id.trim())
    const url = `${baseUrl}/api/v1/posts/${encoded}/comments`
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
      logger.warn('Unipile comment post failed', {
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
      logger.error('Unipile returned non-JSON for comment post')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile comment post validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
