import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileUserRelationsUIAPI')

interface UnipileRelationOption {
  id: string
  label: string
}

/**
 * Lists user relations for attendee pickers (`GET /api/v1/users/relations` upstream).
 * Optional `account_id` query is forwarded when present.
 */
export async function GET(request: NextRequest) {
  const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = env.UNIPILE_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'UNIPILE_API_KEY is not configured', items: [] },
      { status: 503 }
    )
  }

  const accountId = request.nextUrl.searchParams.get('account_id')?.trim()
  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')
  const query = new URLSearchParams()
  if (accountId) {
    query.set('account_id', accountId)
  }
  const qs = query.toString()
  const url = `${baseUrl}/api/v1/users/relations${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile list user relations failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        {
          success: false,
          error: responseText || upstream.statusText || 'Unipile request failed',
          items: [] as UnipileRelationOption[],
        },
        { status: upstream.status }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON for user relations')
      return NextResponse.json(
        { success: false, error: 'Invalid JSON from Unipile', items: [] as UnipileRelationOption[] },
        { status: 502 }
      )
    }

    const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const rawItems = body.items
    const items = Array.isArray(rawItems) ? rawItems : []

    const options: UnipileRelationOption[] = items
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const id =
          (typeof r.provider_id === 'string' && r.provider_id.trim()) ||
          (typeof r.member_id === 'string' && r.member_id.trim()) ||
          (typeof r.id === 'string' && r.id.trim()) ||
          (typeof r.public_identifier === 'string' && r.public_identifier.trim()) ||
          ''
        if (!id) return null
        const first = typeof r.first_name === 'string' ? r.first_name.trim() : ''
        const last = typeof r.last_name === 'string' ? r.last_name.trim() : ''
        const fullName = [first, last].filter(Boolean).join(' ').trim()
        const name = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : fullName
        const headline = typeof r.headline === 'string' ? r.headline.trim().slice(0, 64) : ''
        const label = name ? (headline ? `${name} — ${headline}` : name) : headline || id
        return { id, label }
      })
      .filter((o): o is UnipileRelationOption => o !== null)

    return NextResponse.json({ success: true, items: options })
  } catch (error) {
    logger.error('Unipile user relations UI error', { error })
    return NextResponse.json(
      { success: false, error: 'Failed to list relations', items: [] as UnipileRelationOption[] },
      { status: 500 }
    )
  }
}
