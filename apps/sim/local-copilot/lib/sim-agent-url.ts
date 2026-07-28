import { env } from '@/lib/core/config/env'

/**
 * Resolves SIM_AGENT_API_URL for legacy call sites.
 * Kept separate from routing so client-safe modules (e.g. copilot constants)
 * never pull in DB-backed access checks.
 */
export function resolveSimAgentApiUrl(fallbackDefault: string): string {
  const raw = env.SIM_AGENT_API_URL?.trim()
  if (raw?.startsWith('http://') || raw?.startsWith('https://')) {
    return raw
  }
  return fallbackDefault
}
