import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileRetrieveCompanyDetailsAPI')

const RequestSchema = z.object({
  identifier: z.string().min(1, 'Company identifier is required'),
  account_id: z.string().min(1, 'account_id is required'),
})

/**
 * Proxies `GET /api/v1/linkedin/company/{identifier}?account_id=…` to Unipile using server env credentials.
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
    const { identifier, account_id } = RequestSchema.parse(body)
    const encoded = encodeURIComponent(identifier.trim())
    const query = new URLSearchParams()
    query.set('account_id', account_id.trim())
    const url = `${baseUrl}/api/v1/linkedin/company/${encoded}?${query.toString()}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile LinkedIn company profile request failed', {
        status: upstream.status,
        snippet: responseText.slice(0, 500),
      })
      return NextResponse.json(
        { error: responseText || upstream.statusText || 'Unipile request failed' },
        { status: upstream.status }
      )
    }

    let data: unknown
    try {
      data = JSON.parse(responseText) as unknown
    } catch {
      logger.error('Unipile returned non-JSON body for company profile')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile retrieve company profile validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
