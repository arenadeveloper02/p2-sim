import { getEnv } from '@/lib/core/config/env'
import { isDev, isProd } from '@/lib/core/config/feature-flags'

/**
 * Returns the base URL of the application from NEXT_PUBLIC_APP_URL
 * This ensures webhooks, callbacks, and other integrations always use the correct public URL
 * @returns The base URL string (e.g., 'http://localhost:3000' or 'https://example.com')
 * @throws Error if NEXT_PUBLIC_APP_URL is not configured (except in development where it falls back to localhost)
 */
export function getBaseUrl(): string {
  const baseUrl = getEnv('NEXT_PUBLIC_APP_URL')

  if (!baseUrl) {
    // In development, provide a fallback to localhost
    if (isDev) {
      const port = process.env.PORT || '3000'
      return `http://localhost:${port}`
    }

    throw new Error(
      'NEXT_PUBLIC_APP_URL must be configured for webhooks and callbacks to work correctly. ' +
        'Please set NEXT_PUBLIC_APP_URL in your environment variables (e.g., NEXT_PUBLIC_APP_URL=http://localhost:3000 for development)'
    )
  }

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return baseUrl
  }

  const protocol = isProd ? 'https://' : 'http://'
  return `${protocol}${baseUrl}`
}

/**
 * Returns just the domain and port part of the application URL
 * @returns The domain with port if applicable (e.g., 'localhost:3000' or 'sim.ai')
 */
export function getBaseDomain(): string {
  try {
    const url = new URL(getBaseUrl())
    return url.host // host includes port if specified
  } catch (_e) {
    const fallbackUrl = getEnv('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000'
    try {
      return new URL(fallbackUrl).host
    } catch {
      return isProd ? 'sim.ai' : 'localhost:3000'
    }
  }
}

/**
 * Returns the domain for email addresses, stripping www subdomain for Resend compatibility
 * @returns The email domain (e.g., 'sim.ai' instead of 'www.sim.ai')
 */
export function getEmailDomain(): string {
  try {
    const baseDomain = getBaseDomain()
    return baseDomain.startsWith('www.') ? baseDomain.substring(4) : baseDomain
  } catch (_e) {
    return isProd ? 'sim.ai' : 'localhost:3000'
  }
}

/**
 * Returns the external login redirect URL based on the hostname
 * @param hostname - The hostname from the request
 * @returns The external login URL
 */
export function getLoginRedirectUrl(hostname: string): string {
  if (hostname === 'dev-agent.thearena.ai') {
    return 'https://dev.thearena.ai/'
  }
  if (hostname === 'test-agent.thearena.ai') {
    return 'https://test.thearena.ai/'
  }
  if (hostname === 'sandbox-agent.thearena.ai') {
    return 'https://sandbox.thearena.ai/'
  }
  if (hostname === 'agent.thearena.ai') {
    return 'https://app.thearena.ai/'
  }
  return 'https://dev.thearena.ai/'
}
