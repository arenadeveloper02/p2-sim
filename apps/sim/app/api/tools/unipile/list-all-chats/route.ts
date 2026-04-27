import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListAllChatsAPI')

const optionalString = z.string().nullish()

const ISO_UTC_MS_Z = /^[12]\d{3}-[01]\d-[0-3]\dT\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const ACCOUNT_TYPES = [
  'WHATSAPP',
  'LINKEDIN',
  'SLACK',
  'TWITTER',
  'MESSENGER',
  'INSTAGRAM',
  'TELEGRAM',
] as const

const RequestSchema = z.object({
  account_id: optionalString,
  unread: z.union([z.boolean(), z.string()]).optional().nullable(),
  cursor: optionalString,
  before: optionalString,
  after: optionalString,
  limit: z.coerce.number().int().min(1).max(250).optional().nullable(),
  account_type: optionalString,
})

function appendIfNonEmpty(qs: URLSearchParams, key: string, value: string | null | undefined) {
  if (value == null || value.trim() === '') return
  qs.set(key, value.trim())
}

/**
 * Proxies GET `/api/v1/chats` to Unipile.
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

    if (
      data.before != null &&
      data.before.trim() !== '' &&
      !ISO_UTC_MS_Z.test(data.before.trim())
    ) {
      return NextResponse.json(
        {
          error:
            'before must be ISO 8601 UTC with milliseconds and Z suffix, e.g. 2025-12-31T23:59:59.999Z',
        },
        { status: 400 }
      )
    }
    if (data.after != null && data.after.trim() !== '' && !ISO_UTC_MS_Z.test(data.after.trim())) {
      return NextResponse.json(
        {
          error:
            'after must be ISO 8601 UTC with milliseconds and Z suffix, e.g. 2025-01-01T00:00:00.000Z',
        },
        { status: 400 }
      )
    }

    const at = data.account_type?.trim()
    if (at && !(ACCOUNT_TYPES as readonly string[]).includes(at)) {
      return NextResponse.json(
        { error: `account_type must be one of: ${ACCOUNT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const qs = new URLSearchParams()
    appendIfNonEmpty(qs, 'account_id', data.account_id)
    appendIfNonEmpty(qs, 'cursor', data.cursor)
    appendIfNonEmpty(qs, 'before', data.before)
    appendIfNonEmpty(qs, 'after', data.after)
    if (data.limit != null && Number.isFinite(data.limit)) {
      qs.set('limit', String(data.limit))
    }
    appendIfNonEmpty(qs, 'account_type', data.account_type)

    if (data.unread !== undefined && data.unread !== null) {
      const flag =
        data.unread === true ||
        (typeof data.unread === 'string' && data.unread.toLowerCase() === 'true')
      qs.set('unread', flag ? 'true' : 'false')
    }

    const url = `${baseUrl}/api/v1/chats${qs.toString() ? `?${qs.toString()}` : ''}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile list all chats failed', {
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
      logger.error('Unipile returned non-JSON for list all chats')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile list all chats validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
