import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileListChatAttendeesAPI')

/**
 * Proxies GET `/api/v1/chat_attendees` to Unipile.
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
  const url = `${baseUrl}/api/v1/chat_attendees`
  const upstream = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-KEY': apiKey,
    },
  })

  const responseText = await upstream.text()
  if (!upstream.ok) {
    logger.warn('Unipile list chat attendees failed', {
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
    logger.error('Unipile returned non-JSON for list chat attendees')
    return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
  }
}
