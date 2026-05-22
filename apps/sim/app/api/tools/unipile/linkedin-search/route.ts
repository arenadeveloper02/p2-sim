import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveUnipileApiKeyFromRequestBody } from '@/lib/unipile/resolve-api-key-from-body'

import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileLinkedinSearchAPI')

const optionalString = z.string().nullish()

const RequestSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  search_body: z.string().min(1),
  cursor: optionalString,
  limit: z.coerce.number().int().min(0).max(100).optional().nullable(),
})

function appendIfNonEmpty(qs: URLSearchParams, key: string, value: string | null | undefined) {
  if (value == null || value.trim() === '') return
  qs.set(key, value.trim())
}

/**
 * Proxies POST `/api/v1/linkedin/search` to Unipile with JSON body and query params.
 * @see https://developer.unipile.com/docs/linkedin-search
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

    let parsed: unknown
    try {
      parsed = JSON.parse(data.search_body) as unknown
    } catch {
      return NextResponse.json({ error: 'search_body must be valid JSON' }, { status: 400 })
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'search_body must parse to a JSON object' },
        { status: 400 }
      )
    }

    const qs = new URLSearchParams()
    qs.set('account_id', data.account_id.trim())
    appendIfNonEmpty(qs, 'cursor', data.cursor)
    if (data.limit != null && Number.isFinite(data.limit)) {
      qs.set('limit', String(data.limit))
    }

    const query = qs.toString()
    const url = `${baseUrl}/api/v1/linkedin/search${query ? `?${query}` : ''}`

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(parsed),
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile LinkedIn search failed', {
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
      logger.error('Unipile returned non-JSON for LinkedIn search')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile LinkedIn search validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
