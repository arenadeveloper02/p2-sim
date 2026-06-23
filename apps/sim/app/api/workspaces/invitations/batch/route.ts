import { db } from '@sim/db'
import { permissions, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { normalizeEmail } from '@sim/utils/string'
import { and, eq, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { batchWorkspaceInvitationsContract } from '@/lib/api/contracts/invitations'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { getUserOrganization } from '@/lib/billing/organizations/membership'
import { validateSeatAvailability } from '@/lib/billing/validation/seat-management'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  createWorkspaceInvitation,
  prepareWorkspaceInvitationContext,
  WorkspaceInvitationError,
  type WorkspaceInvitationResult,
} from '@/lib/invitations/workspace-invitations'
import { InvitationsNotAllowedError } from '@/ee/access-control/utils/permission-check'

export const dynamic = 'force-dynamic'

const logger = createLogger('WorkspaceInvitationBatchAPI')

interface BatchInvitationFailure {
  email: string
  error: string
}

function batchErrorResponse(error: unknown) {
  if (error instanceof WorkspaceInvitationError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.email ? { email: error.email } : {}),
        ...(error.upgradeRequired !== undefined ? { upgradeRequired: error.upgradeRequired } : {}),
      },
      { status: error.status }
    )
  }

  if (error instanceof InvitationsNotAllowedError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  logger.error('Error creating workspace invitation batch:', error)
  return NextResponse.json({ error: 'Failed to create invitation batch' }, { status: 500 })
}

export const POST = withRouteHandler(async (req: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = await parseRequest(batchWorkspaceInvitationsContract, req, {})
    if (!parsed.success) return parsed.response
    const { body } = parsed.data

    const context = await prepareWorkspaceInvitationContext({
      workspaceId: body.workspaceId,
      inviterId: session.user.id,
      inviterName: session.user.name || session.user.email || 'A user',
      inviterEmail: session.user.email,
    })

    const successful: string[] = []
    const added: string[] = []
    const failed: BatchInvitationFailure[] = []
    const invitations: WorkspaceInvitationResult[] = []
    const seenEmails = new Set<string>()

    for (const item of body.invitations) {
      const normalizedEmail = normalizeEmail(item.email)
      if (seenEmails.has(normalizedEmail)) {
        failed.push({
          email: normalizedEmail,
          error: `${normalizedEmail} appears more than once in this invitation batch`,
        })
        continue
      }
      seenEmails.add(normalizedEmail)

      const existingUser = await db
        .select()
        .from(user)
        .where(sql`lower(${user.email}) = ${normalizedEmail}`)
        .then((rows) => rows[0])

      if (!existingUser || !existingUser.id || typeof existingUser.id !== 'string') {
        failed.push({
          email: normalizedEmail,
          error: `User with email ${normalizedEmail} does not exist. Please ensure the user has an account before inviting them.`,
        })
        continue
      }

      const existingPermission = await db
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.entityId, context.workspaceId),
            eq(permissions.entityType, 'workspace'),
            eq(permissions.userId, existingUser.id)
          )
        )
        .then((rows) => rows[0])

      if (existingPermission) {
        failed.push({
          email: normalizedEmail,
          error: `${normalizedEmail} already has access to this workspace`,
        })
        continue
      }

      if (context.invitePolicy.requiresSeat && context.invitePolicy.organizationId) {
        const existingMembership = await getUserOrganization(existingUser.id)
        if (
          existingMembership &&
          existingMembership.organizationId !== context.invitePolicy.organizationId
        ) {
          failed.push({
            email: normalizedEmail,
            error:
              'This user is already a member of another organization. They must leave it before joining this workspace.',
          })
          continue
        }

        if (!existingMembership) {
          const seatValidation = await validateSeatAvailability(
            context.invitePolicy.organizationId,
            1
          )
          if (!seatValidation.canInvite) {
            failed.push({
              email: normalizedEmail,
              error: seatValidation.reason || 'No available seats for this organization.',
            })
            continue
          }
        }
      }

      try {
        const invitation = await createWorkspaceInvitation({
          context,
          email: item.email,
          permission: item.permission,
          request: req,
        })
        if (invitation.instantAdd) {
          // Only report an actual insertion; an `unchanged` outcome means the
          // user already had access (rare race) and is a silent no-op.
          if (invitation.outcome === 'added') added.push(invitation.email)
        } else {
          successful.push(invitation.email)
        }
        invitations.push(invitation)
      } catch (error) {
        if (error instanceof WorkspaceInvitationError) {
          failed.push({ email: error.email ?? normalizedEmail, error: error.message })
          continue
        }

        logger.error('Unexpected workspace invitation batch item failure:', {
          email: normalizedEmail,
          error,
        })
        throw error
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      successful,
      added,
      failed,
      invitations,
    })
  } catch (error) {
    return batchErrorResponse(error)
  }
})
