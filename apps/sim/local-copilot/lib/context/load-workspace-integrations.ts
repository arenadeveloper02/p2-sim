import {
  getHubSpotSharedAccountOptionIds,
  mergeOAuthIntegrationPresence,
} from '@/lib/copilot/chat/env-integration-presence'
import { isHosted } from '@/lib/core/config/env-flags'
import {
  getAccessibleEnvCredentials,
  getAccessibleOAuthCredentials,
} from '@/lib/credentials/environment'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import type { LocalCopilotConnectedIntegration } from '@/local-copilot/lib/types'

export interface WorkspaceIntegrationsContext {
  connectedIntegrations: LocalCopilotConnectedIntegration[]
  envVariables: string[]
  hostedKeysAvailable: boolean
}

/**
 * Loads OAuth connections and configured env key names for Arena Copilot context.
 * Secret values are never returned — only key names and credential metadata.
 */
export async function loadWorkspaceIntegrations(
  workspaceId: string,
  userId: string
): Promise<WorkspaceIntegrationsContext> {
  const [oauthRows, envCredentialRows, decryptedEnv] = await Promise.all([
    getAccessibleOAuthCredentials(workspaceId, userId),
    getAccessibleEnvCredentials(workspaceId, userId),
    getEffectiveDecryptedEnv(userId, workspaceId),
  ])

  const envKeysFromCredentials = envCredentialRows
    .map((row) => row.envKey)
    .filter((key): key is string => Boolean(key?.trim()))

  const envKeysFromRuntime = Object.entries(decryptedEnv)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key]) => key)

  const envVariables = [...new Set([...envKeysFromCredentials, ...envKeysFromRuntime])].sort()

  const connectedIntegrations = mergeOAuthIntegrationPresence(
    oauthRows.map((credential) => ({
      id: credential.id,
      providerId: credential.providerId,
      displayName: credential.displayName,
      role: credential.role,
    })),
    envKeysFromCredentials,
    getHubSpotSharedAccountOptionIds()
  ).map((integration) => ({
    credentialId: integration.id,
    providerId: integration.providerId,
    displayName: integration.displayName,
    role: integration.role ?? null,
  }))

  return {
    connectedIntegrations,
    envVariables,
    hostedKeysAvailable: isHosted,
  }
}

export function oauthIntegrationsToCredentialMetadata(
  integrations: LocalCopilotConnectedIntegration[]
): Array<{
  credentialId: string
  provider: string
  status: 'connected'
  displayName?: string
}> {
  return integrations
    .filter((integration) => !integration.credentialId.startsWith('__env__'))
    .filter((integration) => !integration.credentialId.startsWith('__hubspot_'))
    .map((integration) => ({
      credentialId: integration.credentialId,
      provider: integration.providerId,
      status: 'connected' as const,
      ...(integration.displayName ? { displayName: integration.displayName } : {}),
    }))
}
