/**
 * POST /api/v1/admin/client-organizations/ensure-member
 *
 * Idempotent client→organization + workspace provisioning for external systems.
 *
 * Body:
 *   - userId: string — existing Sim user id (must already be registered)
 *   - orgDetails:
 *       - clientId: string — external client identifier
 *       - clientName: string — display name stored on the mapping
 *       - organizationName: string — used when creating the organization
 *
 * Behavior:
 *   - First user for a clientId: creates org (owner), personal WS, and
 *     `{clientName} Workspace` (admin).
 *   - Later users: join org (member), create personal WS, admin on all
 *     non-personal org workspaces.
 *
 * Auth: x-admin-key
 */

import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { createLogger } from '@sim/logger'
import { adminV1EnsureClientOrganizationMemberContract } from '@/lib/api/contracts/v1/admin'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { ensureClientOrganizationMember } from '@/lib/organizations/client-organization'
import { withAdminAuth } from '@/app/api/v1/admin/middleware'
import {
  adminInvalidJsonResponse,
  adminValidationErrorResponse,
  badRequestResponse,
  internalErrorResponse,
  notFoundResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminClientOrganizationsAPI')

export const POST = withRouteHandler(
  withAdminAuth(async (request) => {
    const parsed = await parseRequest(
      adminV1EnsureClientOrganizationMemberContract,
      request,
      {},
      {
        validationErrorResponse: adminValidationErrorResponse,
        invalidJsonResponse: adminInvalidJsonResponse,
      }
    )
    if (!parsed.success) return parsed.response

    const { userId, orgDetails } = parsed.data.body
    const { clientId, clientName, organizationName } = orgDetails

    try {
      const result = await ensureClientOrganizationMember({
        clientId,
        clientName,
        organizationName,
        userId,
      })

      if (!result.success) {
        if (result.failureCode === 'user-not-found') {
          return notFoundResponse('User')
        }
        if (result.failureCode === 'workspace-set-changed') {
          return badRequestResponse(result.error)
        }
        if (result.failureCode === 'internal-error') {
          return internalErrorResponse(result.error)
        }
        return badRequestResponse(result.error)
      }

      recordAudit({
        workspaceId: null,
        actorId: 'admin-api',
        action:
          result.action === 'organization_created'
            ? AuditAction.ORGANIZATION_CREATED
            : AuditAction.ORG_MEMBER_ADDED,
        resourceType: AuditResourceType.ORGANIZATION,
        resourceId: result.organizationId,
        description: `Admin API ensured client organization member (${result.action})`,
        metadata: {
          clientId: result.clientId,
          clientName: result.clientName,
          userId,
          memberId: result.memberId,
          role: result.role,
          action: result.action,
          personalWorkspaceId: result.personalWorkspaceId,
          sharedWorkspaceIds: result.sharedWorkspaceIds,
          attachedWorkspaceIds: result.attachedWorkspaceIds,
        },
        request,
      })

      logger.info('Admin API: Ensured client organization member', {
        clientId: result.clientId,
        organizationId: result.organizationId,
        userId,
        action: result.action,
        role: result.role,
        personalWorkspaceId: result.personalWorkspaceId,
        sharedWorkspaceCount: result.sharedWorkspaceIds.length,
      })

      return singleResponse({
        clientId: result.clientId,
        clientName: result.clientName,
        organizationId: result.organizationId,
        memberId: result.memberId,
        role: result.role,
        action: result.action,
        personalWorkspaceId: result.personalWorkspaceId,
        sharedWorkspaceIds: result.sharedWorkspaceIds,
        attachedWorkspaceIds: result.attachedWorkspaceIds,
      })
    } catch (error) {
      logger.error('Admin API: Failed to ensure client organization member', {
        clientId,
        userId,
        error,
      })
      return internalErrorResponse('Failed to ensure client organization member')
    }
  })
)
