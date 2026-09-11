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
  conflictResponse,
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

    try {
      const result = await ensureClientOrganizationMember({
        ...orgDetails,
        userId,
      })

      if (!result.success) {
        if (result.failureCode === 'user-not-found') {
          return notFoundResponse('User')
        }

        if (result.failureCode === 'already-in-other-organization') {
          return conflictResponse(result.error, {
            existingOrgId: result.existingOrgId,
          })
        }

        if (result.failureCode === 'internal-error') {
          return internalErrorResponse('Failed to ensure client organization membership')
        }

        return badRequestResponse(result.error)
      }

      if (result.action === 'organization_created' || result.action === 'member_added') {
        recordAudit({
          workspaceId: null,
          actorId: 'admin-api',
          action:
            result.action === 'organization_created'
              ? AuditAction.ORGANIZATION_CREATED
              : AuditAction.ORG_MEMBER_ADDED,
          resourceType: AuditResourceType.ORGANIZATION,
          resourceId: result.organizationId,
          description: `Admin API ensured client organization membership (${result.action})`,
          metadata: {
            clientId: result.clientId,
            clientName: result.clientName,
            targetUserId: userId,
            memberId: result.memberId,
            action: result.action,
            personalWorkspaceId: result.personalWorkspaceId,
            sharedWorkspaceIds: result.sharedWorkspaceIds,
            attachedWorkspaceIds: result.attachedWorkspaceIds,
          },
          request,
        })
      }

      const { success: _success, userName: _userName, ...responseData } = result
      return singleResponse(responseData)
    } catch (error) {
      logger.error('Admin API: Failed to ensure client organization membership', { error, userId })
      return internalErrorResponse('Failed to ensure client organization membership')
    }
  })
)
