/**
 * POST /api/v1/admin/client-organizations
 *
 * Creates a client-mapped organization with a Starter subscription and no members.
 * Idempotent on clientId. Owner/members are attached later via ensure-member.
 */

import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { createLogger } from '@sim/logger'
import { adminV1CreateClientOrganizationContract } from '@/lib/api/contracts/v1/admin'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createClientOrganizationShell } from '@/lib/organizations/client-organization'
import { withAdminAuth } from '@/app/api/v1/admin/middleware'
import {
  adminInvalidJsonResponse,
  adminValidationErrorResponse,
  badRequestResponse,
  internalErrorResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminClientOrganizationsAPI')

export const POST = withRouteHandler(
  withAdminAuth(async (request) => {
    const parsed = await parseRequest(
      adminV1CreateClientOrganizationContract,
      request,
      {},
      {
        validationErrorResponse: adminValidationErrorResponse,
        invalidJsonResponse: adminInvalidJsonResponse,
      }
    )
    if (!parsed.success) return parsed.response

    const body = parsed.data.body

    try {
      const result = await createClientOrganizationShell(body)

      if (!result.success) {
        if (result.failureCode === 'internal-error') {
          return internalErrorResponse('Failed to create client organization')
        }
        return badRequestResponse(result.error)
      }

      if (result.action === 'created') {
        recordAudit({
          workspaceId: null,
          actorId: 'admin-api',
          action: AuditAction.ORGANIZATION_CREATED,
          resourceType: AuditResourceType.ORGANIZATION,
          resourceId: result.organizationId,
          resourceName: result.organizationName,
          description: `Admin API created client organization shell "${result.organizationName}"`,
          metadata: {
            clientId: result.clientId,
            clientName: result.clientName,
            subscriptionId: result.subscriptionId,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
            action: result.action,
          },
          request,
        })
      }

      const { success: _success, ...responseData } = result
      return singleResponse(responseData)
    } catch (error) {
      logger.error('Admin API: Failed to create client organization shell', {
        error,
        clientId: body.clientId,
      })
      return internalErrorResponse('Failed to create client organization')
    }
  })
)
