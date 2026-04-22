import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileCreatePostAPI')

const RequestSchema = z.object({
  account_id: z.string().min(1),
  text: z.string().min(1),
  attachments: z.string().optional(),
  video_thumbnail: z.string().optional(),
  repost: z.string().optional(),
  include_job_posting: z.string().optional(),
  name: z.string().optional(),
  profile_id: z.string().optional(),
  is_company: z.string().optional(),
  external_link: z.string().optional(),
  as_organization: z.string().optional(),
  location: z.string().optional(),
})

function appendIfNonEmpty(form: FormData, key: string, value: string | undefined) {
  if (value !== undefined && value.trim() !== '') {
    form.append(key, value.trim())
  }
}

/**
 * Proxies POST `/api/v1/posts` to Unipile as multipart form data.
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
    appendIfNonEmpty(form, 'video_thumbnail', data.video_thumbnail)
    appendIfNonEmpty(form, 'repost', data.repost)
    appendIfNonEmpty(form, 'include_job_posting', data.include_job_posting)
    appendIfNonEmpty(form, 'name', data.name)
    appendIfNonEmpty(form, 'profile_id', data.profile_id)
    appendIfNonEmpty(form, 'is_company', data.is_company)
    appendIfNonEmpty(form, 'external_link', data.external_link)
    appendIfNonEmpty(form, 'as_organization', data.as_organization)
    appendIfNonEmpty(form, 'location', data.location)

    const url = `${baseUrl}/api/v1/posts`
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
      logger.warn('Unipile create post failed', {
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
      logger.error('Unipile returned non-JSON for create post')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile create post validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
