import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import { account, credential, credentialSet, credentialSetMember } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, like, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { disconnectOAuthContract } from '@/lib/api/contracts/oauth-connections'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { deleteCredential } from '@/lib/credentials/deletion'
import { UnipileDeleteAccountError } from '@/lib/unipile/delete-account'
import {
  listAccountsToDisconnect,
  unlinkUnipileAccountsFromProvider,
} from '@/lib/unipile/disconnect-accounts'
import { syncAllWebhooksForCredentialSet } from '@/lib/webhooks/utils.server'

export const dynamic = 'force-dynamic'

const logger = createLogger('OAuthDisconnectAPI')

/**
 * Disconnect an OAuth provider for the current user
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const session = await getSession()

    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated disconnect request rejected`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const parsed = await parseRequest(
      disconnectOAuthContract,
      request,
      {},
      {
        validationErrorResponse: (error) => {
          logger.warn(`[${requestId}] Invalid disconnect request`, { errors: error.issues })
          return NextResponse.json(
            { error: getValidationErrorMessage(error, 'Validation failed') },
            { status: 400 }
          )
        },
      }
    )
    if (!parsed.success) return parsed.response

    const { provider, providerId, accountId } = parsed.data.body
    const userId = session.user.id

    logger.info(`[${requestId}] Processing OAuth disconnect request`, {
      provider,
      hasProviderId: !!providerId,
      hasAccountId: !!accountId,
    })

    const accountsToRemove = await listAccountsToDisconnect({
      userId,
      provider,
      providerId,
      accountRowId: accountId,
    })

    await unlinkUnipileAccountsFromProvider(accountsToRemove)

    // Delete credentials before their accounts so deleteCredential can clear
    // stored references first. Otherwise FK CASCADE would orphan them silently.
    const accountFilter = accountId
      ? and(eq(account.userId, session.user.id), eq(account.id, accountId))
      : providerId
        ? and(eq(account.userId, session.user.id), eq(account.providerId, providerId))
        : and(
            eq(account.userId, session.user.id),
            or(eq(account.providerId, provider), like(account.providerId, `${provider}-%`))
          )

    const targetAccounts = await db.select({ id: account.id }).from(account).where(accountFilter)

    const targetAccountIds = targetAccounts.map((a) => a.id)

    if (targetAccountIds.length > 0) {
      const credentialsToDelete = await db
        .select({ id: credential.id })
        .from(credential)
        .where(inArray(credential.accountId, targetAccountIds))

      for (const cred of credentialsToDelete) {
        await deleteCredential({
          credentialId: cred.id,
          actorId: session.user.id,
          actorName: session.user.name,
          actorEmail: session.user.email,
          reason: 'oauth_disconnect',
          request,
        })
      }

      await db.delete(account).where(inArray(account.id, targetAccountIds))
    }

    const userMemberships = await db
      .select({
        id: credentialSetMember.id,
        credentialSetId: credentialSetMember.credentialSetId,
        providerId: credentialSet.providerId,
      })
      .from(credentialSetMember)
      .innerJoin(credentialSet, eq(credentialSetMember.credentialSetId, credentialSet.id))
      .where(and(eq(credentialSetMember.userId, userId), eq(credentialSetMember.status, 'active')))

    for (const membership of userMemberships) {
      const matchesProvider =
        membership.providerId === provider ||
        membership.providerId === providerId ||
        membership.providerId?.startsWith(`${provider}-`)

      if (matchesProvider) {
        try {
          await syncAllWebhooksForCredentialSet(membership.credentialSetId, requestId)
          logger.info(`[${requestId}] Synced webhooks after credential disconnect`, {
            credentialSetId: membership.credentialSetId,
            provider,
          })
        } catch (error) {
          logger.error(`[${requestId}] Failed to sync webhooks after credential disconnect`, {
            credentialSetId: membership.credentialSetId,
            provider,
            error,
          })
        }
      }
    }

    recordAudit({
      workspaceId: null,
      actorId: userId,
      action: AuditAction.OAUTH_DISCONNECTED,
      resourceType: AuditResourceType.OAUTH,
      resourceId: providerId ?? provider,
      actorName: session.user.name ?? undefined,
      actorEmail: session.user.email ?? undefined,
      resourceName: provider,
      description: `Disconnected OAuth provider: ${provider}`,
      metadata: { provider, providerId, accountId },
      request,
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    if (error instanceof UnipileDeleteAccountError) {
      logger.warn(`[${requestId}] Unipile unlink failed during disconnect`, {
        status: error.status,
        message: error.message,
      })
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    if (
      message.includes('Unipile API key') ||
      message.includes('UNIPILE_API_KEY') ||
      message.includes('Failed to unlink LinkedIn')
    ) {
      logger.warn(`[${requestId}] Unipile disconnect configuration error`, { message })
      return NextResponse.json({ error: message }, { status: 502 })
    }

    logger.error(`[${requestId}] Error disconnecting OAuth provider`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
