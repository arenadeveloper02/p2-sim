import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'

const logger = createLogger('SemrushQueryAPI')

/**
 * Proxies Semrush API requests so the tool hits our server (avoiding external URL
 * validation) and we add the API key server-side. Accepts internal JWT (executor)
 * or session auth so both server-to-server and same-origin requests work.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
    if (!auth.success) {
      logger.warn('Unauthorized Semrush query attempt', { error: auth.error })
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const apiKey = env.SEMRUSH_API_KEY
    if (!apiKey) {
      logger.error('Semrush API key not configured (SEMRUSH_API_KEY)')
      return NextResponse.json(
        { error: 'Semrush API key is not configured. Set SEMRUSH_API_KEY in environment.' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'domain_organic'
    const database = searchParams.get('database') ?? 'us'

    const semrushParams = new URLSearchParams()
    semrushParams.set('type', type)
    semrushParams.set('key', apiKey)
    semrushParams.set('database', database)

    if (type.startsWith('url_')) {
      const url = searchParams.get('url')
      if (!url) {
        return NextResponse.json(
          { error: 'Parameter "url" is required for URL-based report types.' },
          { status: 400 }
        )
      }
      semrushParams.set('url', url)
    } else {
      const domain = searchParams.get('domain')
      if (!domain) {
        return NextResponse.json(
          { error: 'Parameter "domain" is required for domain-based report types.' },
          { status: 400 }
        )
      }
      semrushParams.set('domain', domain)
    }

    const displayLimit = searchParams.get('display_limit')
    if (displayLimit) semrushParams.set('display_limit', displayLimit)
    const exportColumns = searchParams.get('export_columns')
    if (exportColumns) semrushParams.set('export_columns', exportColumns)

    const additionalParams = searchParams.get('additionalParams')
    if (additionalParams) {
      try {
        const extra = new URLSearchParams(additionalParams)
        extra.forEach((value, key) => semrushParams.set(key, value))
      } catch {
        logger.warn('Failed to parse additionalParams', { additionalParams })
      }
    }

    const semrushUrl = `https://api.semrush.com/?${semrushParams.toString()}`
    logger.info('Semrush proxy: fetching', {
      type,
      param: type.startsWith('url_') ? 'url' : 'domain',
    })

    const res = await fetch(semrushUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain, text/csv, */*',
      },
    })

    const body = await res.text()
    const contentType = res.headers.get('content-type') ?? 'text/plain; charset=utf-8'

    return new NextResponse(body, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        'Content-Type': contentType,
      },
    })
  } catch (error) {
    logger.error('Semrush proxy error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Semrush proxy failed' },
      { status: 500 }
    )
  }
}
