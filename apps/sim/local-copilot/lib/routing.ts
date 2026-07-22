import { createLogger } from '@sim/logger'
import { getLocalCopilotUserAccess, isLocalCopilotEnabledForUser } from '@/local-copilot/lib/access'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { parseCopilotBackendPreference } from '@/local-copilot/lib/copilot-backend-preference'

export { resolveSimAgentApiUrl } from '@/local-copilot/lib/sim-agent-url'

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
 * When Arena Copilot is enabled and the user is on the DB allowlist,
 * all copilot chat (home + workflow) is handled in-process.
 * Requires workspace and user context; workflow is optional (home chat has none).
 */
export async function shouldRouteToLocalCopilot(params: {
  workflowId?: unknown
  workspaceId?: unknown
  userId?: unknown
  copilotBackend?: unknown
}): Promise<boolean> {
  const workspaceId = extractNonEmpty(params.workspaceId)
  const userId = extractNonEmpty(params.userId)
  const workflowId = extractNonEmpty(params.workflowId)
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

  const access = await getLocalCopilotUserAccess(userId)
  if (!access.hasAccess && !access.localOnly) {
    logger.info('Arena Copilot route skipped', {
      reason: 'disabled_or_user_not_allowed',
      workspaceId,
      userId,
      workflowId: workflowId ?? null,
      preference,
      copilotEnabled: config.enabled,
    })
    return false
  }

  // Local-only users are always routed to Local, ignoring any stored/stale
  // `external` preference. Full-access users may opt into Cloud.
  if (!access.localOnly && preference === 'external') {
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

export async function shouldUseLocalCopilotChat(userId?: string | null): Promise<boolean> {
  return isLocalCopilotEnabledForUser(userId)
}
