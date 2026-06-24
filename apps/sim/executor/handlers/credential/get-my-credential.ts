import { createLogger } from '@sim/logger'
import {
  getWorkspaceOAuthCredentialsForUserProvider,
  syncWorkspaceOAuthCredentialsForUser,
} from '@/lib/credentials/oauth'
import { getServiceConfigByProviderId } from '@/lib/oauth/utils'
import type { BlockOutput } from '@/blocks/types'
import type { ExecutionContext } from '@/executor/types'

const logger = createLogger('GetMyCredential')

export async function resolveMyCredential(
  ctx: ExecutionContext,
  inputs: Record<string, unknown>
): Promise<BlockOutput> {
  const userId =
    ctx.metadata?.sessionUserId?.trim() || ctx.userId?.trim() || undefined
  const providerId = typeof inputs.myProviderId === 'string' ? inputs.myProviderId.trim() : ''

  const workspaceId = ctx.workspaceId
  if (!workspaceId) {
    throw new Error('workspaceId is required for credential resolution')
  }

  if (!userId) {
    throw new Error('userId is required for credential resolution')
  }

  if (!providerId) {
    throw new Error('Provider is required')
  }

  await syncWorkspaceOAuthCredentialsForUser({ workspaceId, userId })

  const matches = (
    await getWorkspaceOAuthCredentialsForUserProvider({ workspaceId, userId, providerId })
  ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

  if (matches.length === 0) {
    const providerName = getServiceConfigByProviderId(providerId)?.name ?? providerId
    throw new Error(`No connected ${providerName} credential found for the current user`)
  }

  const record = matches[0]

  logger.info('Resolved current user credential', {
    credentialId: record.id,
    providerId,
    userId,
  })

  return {
    myCredentialId: record.id,
    myDisplayName: record.displayName,
    myProviderId: record.providerId,
  }
}
