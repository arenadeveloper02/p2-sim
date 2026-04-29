import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import {
  UNIPILE_LINKEDIN_PROFILE_API,
  UNIPILE_LINKEDIN_PROFILE_SECTIONS,
} from '@/tools/unipile/linkedin_profile_query'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileGetUserProfileAPI')

const optionalString = z.string().nullish()

const sectionSet = new Set<string>(UNIPILE_LINKEDIN_PROFILE_SECTIONS)
const apiSet = new Set<string>(UNIPILE_LINKEDIN_PROFILE_API)

const RequestSchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
  user_identifier: z.string().min(1),
  linkedin_sections_json: optionalString,
  linkedin_api: optionalString,
  notify: z
    .any()
    .optional()
    .transform((v: unknown) => {
      if (v === null || v === undefined || v === '') return undefined
      if (v === true || v === 'true') return true
      if (v === false || v === 'false') return false
      return undefined
    }),
})

function parseSectionsJson(raw: string | null | undefined): string[] | undefined {
  if (raw == null || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined
  const out: string[] = []
  for (const item of parsed) {
    if (typeof item !== 'string' || !sectionSet.has(item)) {
      return undefined
    }
    out.push(item)
  }
  return out
}

/**
 * Proxies GET `/api/v1/users/{identifier}` to Unipile with required query params.
 * @see https://developer.unipile.com/docs/provider-limits-and-restrictions
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

    const sections = parseSectionsJson(data.linkedin_sections_json ?? undefined)
    if (
      data.linkedin_sections_json != null &&
      String(data.linkedin_sections_json).trim() !== '' &&
      sections === undefined
    ) {
      return NextResponse.json(
        {
          error:
            'linkedin_sections_json must be a JSON array of valid section names (see Unipile docs)',
        },
        { status: 400 }
      )
    }

    let linkedinApi: string | undefined
    if (data.linkedin_api != null && String(data.linkedin_api).trim() !== '') {
      const v = String(data.linkedin_api).trim()
      if (!apiSet.has(v)) {
        return NextResponse.json(
          { error: 'linkedin_api must be recruiter or sales_navigator' },
          { status: 400 }
        )
      }
      linkedinApi = v
    }

    const encoded = encodeURIComponent(data.user_identifier.trim())
    const qs = new URLSearchParams()
    qs.set('account_id', data.account_id.trim())
    if (sections) {
      for (const s of sections) {
        qs.append('linkedin_sections', s)
      }
    }
    if (linkedinApi) {
      qs.set('linkedin_api', linkedinApi)
    }
    if (data.notify === true) {
      qs.set('notify', 'true')
    } else if (data.notify === false) {
      qs.set('notify', 'false')
    }

    const query = qs.toString()
    const url = `${baseUrl}/api/v1/users/${encoded}${query ? `?${query}` : ''}`

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await upstream.text()
    if (!upstream.ok) {
      logger.warn('Unipile retrieve profile failed', {
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
      logger.error('Unipile returned non-JSON for retrieve profile')
      return NextResponse.json({ error: 'Invalid JSON from Unipile' }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.message : 'Invalid request body'
    logger.warn('Unipile retrieve profile validation failed', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
