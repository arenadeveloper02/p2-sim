import { createLogger } from '@sim/logger'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { isLocalCopilotEnabledForUser } from '@/local-copilot/lib/access'
import { parseCopilotBackendPreference } from '@/local-copilot/lib/copilot-backend-preference'
import { env } from '@/lib/core/config/env'

const logger = createLogger('LocalCopilotRouting')

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
  const workspaceId = extractNonEmpty(params.workspaceId)
  const userId = extractNonEmpty(params.userId)
  const workflowId = extractNonEmpty(params.workflowId)
  const userEmail = typeof params.userEmail === 'string' ? params.userEmail : undefined
  const preference = parseCopilotBackendPreference(params.copilotBackend)
  const config = getLocalCopilotConfig()

  if (!workspaceId || !userId) {
    logger.info('Arena Copilot route skipped', {
      reason: 'missing_workspace_or_user',
      hasWorkspaceId: Boolean(workspaceId),
      hasUserId: Boolean(userId),
      workflowId: workflowId ?? null,
      preference,
      copilotEnabled: config.enabled,
    })
    return false
  }

  if (!isLocalCopilotEnabledForUser(userEmail)) {
    logger.info('Arena Copilot route skipped', {
      reason: 'disabled_or_email_not_allowed',
      workspaceId,
      userId,
      workflowId: workflowId ?? null,
      preference,
      copilotEnabled: config.enabled,
      hasUserEmail: Boolean(userEmail?.trim()),
    })
    return false
  }

  if (preference === 'external') {
    logger.info('Arena Copilot route skipped', {
      reason: 'user_prefer_external',
      workspaceId,
      userId,
      workflowId: workflowId ?? null,
      preference,
      provider: config.provider,
      model: config.model,
    })
    return false
  }

  logger.info('Arena Copilot route selected', {
    workspaceId,
    userId,
    workflowId: workflowId ?? null,
    preference: preference ?? 'default',
    provider: config.provider,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
  })
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
