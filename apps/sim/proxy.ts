import { createLogger } from '@sim/logger'
import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'
import { sendToProfound } from './lib/analytics/profound'
import { getEnv } from './lib/core/config/env'
import { isAuthDisabled, isDev } from './lib/core/config/feature-flags'
import { apiCorsPatch, apiCorsPreflight } from './lib/core/security/api-cors'
import { generateRuntimeCSP } from './lib/core/security/csp'
import { getClientIp } from './lib/core/utils/request'
import { getLoginRedirectUrl } from './lib/core/utils/urls'

const logger = createLogger('Proxy')

/**
 * Helper function to check if email cookie exists
 */
function hasEmailCookie(request: NextRequest): boolean {
  const emailCookie = request.cookies.get('email')
  return !!emailCookie?.value
}

const SUSPICIOUS_UA_PATTERNS = [
  /^\s*$/, // Empty user agents
  /\.\./, // Path traversal attempt
  /<\s*script/i, // Potential XSS payloads
  /^\(\)\s*{/, // Command execution attempt
  /\b(sqlmap|nikto|gobuster|dirb|nmap)\b/i, // Known scanning tools
] as const

/**
 * Handles authentication-based redirects for root paths
 */
function handleRootPathRedirects(
  request: NextRequest,
  hasActiveSession: boolean
): NextResponse | null {
  const url = request.nextUrl

  if (url.pathname !== '/') {
    return null
  }

  // Always redirect root path to workspace
  // Auto-login will handle authentication if email cookie exists
  if (hasActiveSession) {
    const isBrowsingHome = url.searchParams.has('home')
    if (!isBrowsingHome) {
      return NextResponse.redirect(new URL('/workspace', request.url))
    }
    return null
  }

  // No session - check for email cookie in local dev
  if (isDev) {
    if (hasEmailCookie(request)) {
      // Email cookie exists - redirect to workspace (auto-login will handle it)
      return NextResponse.redirect(new URL('/workspace', request.url))
    }
    // No email cookie in dev - redirect to login page
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Non-local environment - always redirect to workspace (auto-login will handle it)
  return NextResponse.redirect(new URL('/workspace', request.url))
}

/**
 * Handles invitation link redirects for unauthenticated users
 */
function handleInvitationRedirects(
  request: NextRequest,
  hasActiveSession: boolean
): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/invite/')) {
    return null
  }

  if (
    !hasActiveSession &&
    !request.nextUrl.pathname.endsWith('/login') &&
    !request.nextUrl.pathname.endsWith('/signup') &&
    !request.nextUrl.search.includes('callbackUrl')
  ) {
    const token = request.nextUrl.searchParams.get('token')
    const inviteId = request.nextUrl.pathname.split('/').pop()
    const callbackParam = encodeURIComponent(`/invite/${inviteId}${token ? `?token=${token}` : ''}`)
    const hostname = request.nextUrl.hostname
    const externalLoginUrl = getLoginRedirectUrl(hostname)
    const loginUrl = new URL(externalLoginUrl)
    loginUrl.searchParams.set('callbackUrl', callbackParam)
    loginUrl.searchParams.set('invite_flow', 'true')
    return NextResponse.redirect(loginUrl.toString())
  }
  return NextResponse.next()
}

/**
 * Handles security filtering for suspicious user agents
 */
function handleSecurityFiltering(request: NextRequest): NextResponse | null {
  const userAgent = request.headers.get('user-agent') || ''
  const { pathname } = request.nextUrl
  const isWebhookEndpoint = pathname.startsWith('/api/webhooks/trigger/')
  const isMcpEndpoint = pathname.startsWith('/api/mcp/')
  const isMcpOauthDiscoveryEndpoint =
    pathname.startsWith('/.well-known/oauth-authorization-server') ||
    pathname.startsWith('/.well-known/oauth-protected-resource')
  const isSuspicious = SUSPICIOUS_UA_PATTERNS.some((pattern) => pattern.test(userAgent))

  // Block suspicious requests, but exempt machine-to-machine endpoints that may
  // legitimately omit User-Agent headers (webhooks and MCP protocol discovery/calls).
  if (isSuspicious && !isWebhookEndpoint && !isMcpEndpoint && !isMcpOauthDiscoveryEndpoint) {
    logger.warn('Blocked suspicious request', {
      userAgent,
      ip: getClientIp(request),
      url: request.url,
      method: request.method,
      pattern: SUSPICIOUS_UA_PATTERNS.find((pattern) => pattern.test(userAgent))?.toString(),
    })

    return new NextResponse(null, {
      status: 403,
      statusText: 'Forbidden',
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'",
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  }

  return null
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl

  const cors = apiCorsPreflight(request)
  if (cors) return cors

  const sessionCookie = getSessionCookie(request)
  const hasActiveSession = isAuthDisabled || !!sessionCookie

  if (url.pathname === '/session-required') {
    if (hasActiveSession) {
      return track(request, NextResponse.redirect(new URL('/workspace', request.url)))
    }
    return track(request, NextResponse.next())
  }

  const redirect = handleRootPathRedirects(request, hasActiveSession)
  if (redirect) return track(request, redirect)

  if (url.pathname === '/login' || url.pathname === '/signup') {
    // Block login/signup pages in non-local environments
    if (!isDev) {
      // In non-local environments, redirect to workspace (auto-login will handle authentication)
      return track(request, NextResponse.redirect(new URL('/workspace', request.url)))
    }
    if (hasActiveSession) {
      return track(request, NextResponse.redirect(new URL('/workspace', request.url)))
    }
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', generateRuntimeCSP())
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    return track(request, response)
  }

  // Chat pages are publicly accessible embeds — CSP is set in next.config.ts headers
  if (url.pathname.startsWith('/chat/')) {
    return track(request, NextResponse.next())
  }

  // Allow public access to template pages for SEO
  if (url.pathname.startsWith('/templates')) {
    return track(request, NextResponse.next())
  }

  if (url.pathname.startsWith('/workspace')) {
    // Allow public access to workspace template pages - they handle their own redirects
    if (url.pathname.match(/^\/workspace\/[^/]+\/templates/)) {
      return track(request, NextResponse.next())
    }

    if (!hasActiveSession) {
      if (isDev) {
        if (hasEmailCookie(request)) {
          return track(request, NextResponse.next())
        }
        return track(request, NextResponse.redirect(new URL('/login', request.url)))
      }
      const arenaHub = getEnv('NEXT_PUBLIC_ARENA_FRONTEND_APP_URL')?.trim()
      if (arenaHub) {
        // Same as dev: allow workspace to load so AutoLoginProvider can run sign-in
        // when the email cookie is present (avoids flashing session-required first).
        if (hasEmailCookie(request)) {
          return track(request, NextResponse.next())
        }
        return track(request, NextResponse.redirect(new URL('/session-required', request.url)))
      }
      return track(request, NextResponse.next())
    }
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', generateRuntimeCSP())
    response.headers.set('X-Content-Type-Options', 'nosniff')
    // response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    return track(request, response)
  }

  const invitationRedirect = handleInvitationRedirects(request, hasActiveSession)
  if (invitationRedirect) return track(request, invitationRedirect)

  const securityBlock = handleSecurityFiltering(request)
  if (securityBlock) return track(request, securityBlock)

  const response = NextResponse.next()
  response.headers.set('Vary', 'User-Agent')

  if (url.pathname === '/') {
    response.headers.set('Content-Security-Policy', generateRuntimeCSP())
    response.headers.set('X-Content-Type-Options', 'nosniff')
    // response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  }

  return track(request, response)
}

/**
 * Sends request data to Profound analytics (fire-and-forget) and returns the response.
 */
function track(request: NextRequest, response: NextResponse): NextResponse {
  sendToProfound(request, response.status)
  return apiCorsPatch(request, response)
}

export const config = {
  matcher: [
    '/', // Root path for self-hosted redirect logic
    '/terms', // Whitelabel terms redirect
    '/privacy', // Whitelabel privacy redirect
    '/w', // Legacy /w redirect
    '/w/:path*', // Legacy /w/* redirects
    '/workspace/:path*', // New workspace routes
    '/login',
    '/signup',
    '/invite/:path*', // Match invitation routes
    '/session-required',
    // Catch-all for other pages, excluding static assets and public directories
    '/((?!_next/static|_next/image|ingest|favicon.ico|logo/|static/|footer/|social/|enterprise/|favicon/|twitter/|robots.txt|sitemap.xml).*)',
  ],
}
