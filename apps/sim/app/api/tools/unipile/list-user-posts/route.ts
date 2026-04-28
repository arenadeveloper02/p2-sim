import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListUserPostsAPI')

const RequestSchema = z.object({
  account_id: z.string().min(1),
  user_identifier: z.string().min(1),
  cursor: z.string().optional().nullable(),
  limit: z.coerce.number().int().min(1).max(100).optional().nullable(),
  is_company: z.boolean().optional().nullable(),
})

/**
 * Proxies GET `/api/v1/users/{identifier}/posts` to Unipile (list all posts).
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
    const encoded = encodeURIComponent(data.user_identifier.trim())
    const params = new URLSearchParams()
    params.set('account_id', data.account_id.trim())
    if (data.cursor != null && String(data.cursor).trim() !== '') {
      params.set('cursor', String(data.cursor).trim())
    }
    if (data.limit != null && Number.isFinite(data.limit)) {
      params.set('limit', String(data.limit))
    }
    if (data.is_company === true) {
      params.set('is_company', 'true')
    } else if (data.is_company === false) {
      params.set('is_company', 'false')
    }
    const qs = params.toString()
    const url = `${baseUrl}/api/v1/users/${encoded}/posts${qs ? `?${qs}` : ''}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile list all posts failed', {
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
      logger.error('Unipile returned non-JSON for list all posts')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile list all posts validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
