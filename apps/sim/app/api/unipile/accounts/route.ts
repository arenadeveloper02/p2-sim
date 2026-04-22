import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileAccountsAPI')

interface UnipileAccountOption {
  id: string
  label: string
}

/**
 * Lists Unipile connected accounts for the block editor (`GET /api/v1/accounts` upstream).
 * Requires a signed-in session or internal JWT; uses server `UNIPILE_API_KEY`.
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

  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')
  const url = `${baseUrl}/api/v1/accounts`

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
      logger.warn('Unipile list accounts failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        {
          success: false,
          error: responseText || upstream.statusText || 'Unipile request failed',
          items: [] as UnipileAccountOption[],
        },
        { status: upstream.status }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON for list accounts')
      return NextResponse.json(
        { success: false, error: 'Invalid JSON from Unipile', items: [] as UnipileAccountOption[] },
        { status: 502 }
      )
    }

    const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const rawItems = body.items
    const items = Array.isArray(rawItems) ? rawItems : []

    const options: UnipileAccountOption[] = items
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id.trim() : ''
        if (!id) return null
        const name = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : 'Account'
        const type = typeof r.type === 'string' && r.type.trim() !== '' ? r.type.trim() : 'unknown'
        return { id, label: `${name} (${type})` }
      })
      .filter((o): o is UnipileAccountOption => o !== null)

    return NextResponse.json({ success: true, items: options })
  } catch (error) {
    logger.error('Unipile list accounts error', { error })
    return NextResponse.json(
      { success: false, error: 'Failed to list accounts', items: [] as UnipileAccountOption[] },
      { status: 500 }
    )
  }
}
