import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { isLocalCopilotEnabledForUser } from '@/local-copilot/lib/access'
import { parseCopilotBackendPreference } from '@/local-copilot/lib/copilot-backend-preference'
import { env } from '@/lib/core/config/env'

export const LOCAL_COPILOT_CHAT_API_PATH = '/api/local-copilot/chat'

/**
 * When true, all copilot chat (home + workflow) is handled in-process via Arena Copilot.
 */
export function isLocalCopilotBackendActive(): boolean {
  return getLocalCopilotConfig().enabled
}

function extractNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * When Arena Copilot is enabled, all copilot chat (home + workflow) is handled in-process.
 * Requires workspace and user context; workflow is optional (home chat has none).
 */
export function shouldRouteToLocalCopilot(params: {
  workflowId?: unknown
  workspaceId?: unknown
  userId?: unknown
  userEmail?: unknown
  copilotBackend?: unknown
}): boolean {
  if (!extractNonEmpty(params.workspaceId) || !extractNonEmpty(params.userId)) return false

  const userEmail = typeof params.userEmail === 'string' ? params.userEmail : undefined
  if (!isLocalCopilotEnabledForUser(userEmail)) return false

  const preference = parseCopilotBackendPreference(params.copilotBackend)
  if (preference === 'external') return false
  return true
}

/**
 * Resolves SIM_AGENT_API_URL for legacy call sites.
 */
export function resolveSimAgentApiUrl(fallbackDefault: string): string {
  const raw = env.SIM_AGENT_API_URL?.trim()
  if (raw?.startsWith('http://') || raw?.startsWith('https://')) {
    return raw
  }
  return fallbackDefault
}

export function shouldUseLocalCopilotChat(userEmail?: string | null): boolean {
  return isLocalCopilotEnabledForUser(userEmail)
}
