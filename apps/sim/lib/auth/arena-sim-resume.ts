import { getEnv } from '@/lib/core/config/env'
import { getLoginRedirectUrl } from '@/lib/core/utils/urls'

/**
 * Arena hub base for SSO resume (sim-resume bounce that issues an SSO code).
 */
function resolveArenaHubBase(hostname?: string): string | null {
  const fromPublic = getEnv('NEXT_PUBLIC_ARENA_FRONTEND_APP_URL')?.trim()
  if (fromPublic) return fromPublic.replace(/\/$/, '')

  const fromServer = getEnv('ARENA_FRONTEND_APP_URL')?.trim()
  if (fromServer) return fromServer.replace(/\/$/, '')

  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : undefined)
  if (!host) return null

  try {
    return new URL(getLoginRedirectUrl(host)).origin
  } catch {
    return getLoginRedirectUrl(host).replace(/\/$/, '') || null
  }
}

/**
 * Builds Arena `/sso/sim-resume?returnTo=…` so the hub can mint an SSO code and
 * redirect back to Agent to set Better Auth session cookies.
 *
 * @returns Absolute resume URL, or null when no Arena hub can be resolved.
 */
export function buildArenaSimResumeUrl(returnTo: string | URL, hostname?: string): URL | null {
  const arenaHub = resolveArenaHubBase(hostname)
  if (!arenaHub) return null

  const resume = new URL('/sso/sim-resume', arenaHub)
  const returnToHref = typeof returnTo === 'string' ? returnTo : returnTo.href
  resume.searchParams.set('returnTo', returnToHref)
  return resume
}

/** Path used when Arena hub URL cannot be resolved (misconfigured env). */
export const ARENA_SSO_SESSION_REQUIRED_PATH = '/session-required' as const
