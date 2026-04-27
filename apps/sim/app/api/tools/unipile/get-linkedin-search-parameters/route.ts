import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import {
  UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPES,
  UNIPILE_LINKEDIN_SEARCH_SERVICES,
} from '@/tools/unipile/linkedin_search_parameter_types'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileGetLinkedinSearchParametersAPI')

const optionalString = z.string().nullish()

const allowedTypes = new Set<string>(UNIPILE_LINKEDIN_SEARCH_PARAMETER_TYPES)
const allowedServices = new Set<string>(UNIPILE_LINKEDIN_SEARCH_SERVICES)

const RequestSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  type: z
    .string()
    .min(1, 'type is required')
    .refine((v) => allowedTypes.has(v), { message: 'type must be a valid LinkedIn search parameter type' }),
  service: optionalString,
  keywords: optionalString,
  limit: z.coerce.number().int().min(1).max(100).optional().nullable(),
})

/**
 * Proxies GET `/api/v1/linkedin/search/parameters` to Unipile.
 * @see https://developer.unipile.com/docs/linkedin-search
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

    const serviceTrim =
      typeof data.service === 'string' && data.service.trim() !== '' ? data.service.trim() : null
    if (serviceTrim != null && !allowedServices.has(serviceTrim)) {
      return NextResponse.json(
        { error: 'service must be CLASSIC, RECRUITER, or SALES_NAVIGATOR' },
        { status: 400 }
      )
    }

    const params = new URLSearchParams()
    params.set('account_id', data.account_id.trim())
    params.set('type', data.type.trim())
    params.set('service', serviceTrim ?? 'CLASSIC')
    if (data.keywords != null && data.keywords.trim() !== '') {
      params.set('keywords', data.keywords.trim())
    }
    if (data.limit != null && Number.isFinite(data.limit)) {
      params.set('limit', String(data.limit))
    }

    const url = `${baseUrl}/api/v1/linkedin/search/parameters?${params.toString()}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile get LinkedIn search parameters failed', {
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
      logger.error('Unipile returned non-JSON for LinkedIn search parameters')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile get LinkedIn search parameters validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
