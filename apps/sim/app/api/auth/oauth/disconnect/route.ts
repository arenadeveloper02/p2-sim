import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import { account, credentialSet, credentialSetMember } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, like, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { UnipileDeleteAccountError } from '@/lib/unipile/delete-account'
import {
  listAccountsToDisconnect,
  unlinkUnipileAccountsFromProvider,
} from '@/lib/unipile/disconnect-accounts'
import { syncAllWebhooksForCredentialSet } from '@/lib/webhooks/utils.server'

export const dynamic = 'force-dynamic'

const logger = createLogger('OAuthDisconnectAPI')

const disconnectSchema = z.object({
  provider: z.string({ required_error: 'Provider is required' }).min(1, 'Provider is required'),
  providerId: z.string().optional(),
  accountId: z.string().optional(),
})

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

    const rawBody = await request.json()
    const parseResult = disconnectSchema.safeParse(rawBody)

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]
      const errorMessage = firstError?.message || 'Validation failed'

      logger.warn(`[${requestId}] Invalid disconnect request`, {
        errors: parseResult.error.errors,
      })

      return NextResponse.json(
        {
          error: errorMessage,
        },
        { status: 400 }
      )
    }

    const { provider, providerId, accountId } = parseResult.data
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

    await unlinkUnipileAccountsFromProvider(accountsToRemove, { userId })

    if (accountId) {
      await db.delete(account).where(and(eq(account.userId, userId), eq(account.id, accountId)))
    } else if (providerId) {
      await db
        .delete(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    } else {
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, userId),
            or(eq(account.providerId, provider), like(account.providerId, `${provider}-%`))
          )
        )
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
