import { type NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/core/config/env'
import { isDev } from '@/lib/core/config/feature-flags'

const ALLOW_HEADERS =
  'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key, Authorization'

function norm(o: string) {
  try {
    return new URL(o.trim()).origin
  } catch {
    return o.trim().replace(/\/$/, '')
  }
}

function skip(p: string) {
  return (
    p.startsWith('/api/auth/oauth2/') ||
    p === '/api/auth/jwks' ||
    p.startsWith('/api/auth/.well-known/') ||
    p === '/api/mcp/copilot' ||
    /^\/api\/workflows\/[^/]+\/execute$/.test(p)
  )
}

function allowlist(): Set<string> {
  const s = new Set<string>()
  const add = (x: string) => {
    const n = norm(x)
    if (n) s.add(n)
  }
  const app = getEnv('NEXT_PUBLIC_APP_URL')?.trim()
  if (app) add(app)
  getEnv('ALLOWED_ORIGINS')
    ?.split(',')
    .forEach((p) => p.trim() && add(p))
  if (isDev) {
    for (const h of ['localhost', '127.0.0.1'])
      for (const port of ['3000', '3001']) add(`http://${h}:${port}`)
  }
  return s
}

/** OPTIONS preflight for /api (paths with static * CORS in next.config are skipped). */
export function apiCorsPreflight(request: NextRequest): NextResponse | null {
  const p = request.nextUrl.pathname
  if (!p.startsWith('/api/') || request.method !== 'OPTIONS' || skip(p)) return null

  const allowed = allowlist()
  const o = request.headers.get('origin')
  const base = getEnv('NEXT_PUBLIC_APP_URL')?.trim()
  const baseHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,PUT,DELETE',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Credentials': 'true',
  }
  if (o) {
    const origin = norm(o)
    if (!allowed.has(origin)) return new NextResponse(null, { status: 204 })
    return new NextResponse(null, {
      status: 204,
      headers: { ...baseHeaders, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' },
    })
  }
  if (base) {
    return new NextResponse(null, {
      status: 204,
      headers: { ...baseHeaders, 'Access-Control-Allow-Origin': norm(base) },
    })
  }
  return new NextResponse(null, { status: 204 })
}

/** Reflect Origin when allowlisted; else fall back to NEXT_PUBLIC_APP_URL when no Origin header. */
export function apiCorsPatch(request: NextRequest, response: NextResponse): NextResponse {
  const p = request.nextUrl.pathname
  if (!p.startsWith('/api/') || skip(p)) return response

  const o = request.headers.get('origin')
  const base = getEnv('NEXT_PUBLIC_APP_URL')?.trim()

  if (o) {
    const origin = norm(o)
    if (!allowlist().has(origin)) return response
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.append('Vary', 'Origin')
    return response
  }
  if (base) {
    response.headers.set('Access-Control-Allow-Origin', norm(base))
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  return response
}
