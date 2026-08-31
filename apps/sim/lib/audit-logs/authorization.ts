import { db } from '@sim/db'
import { member } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type { ForbiddenDetailCode } from '@/lib/core/application'
import { isAuditLogsEnabled, isBillingEnabled } from '@/lib/core/config/env-flags'

const logger = createLogger('AuditLogAuthorization')

export interface EnterpriseAuditContext {
  organizationId: string
  orgMemberIds: string[]
}

/**
 * A refusal names its cause as well as its wording. This resolver distinguishes
 * three of them — not a member, not an admin, or audit logging switched off —
 * and each has a different remedy, so collapsing them into one
 * status forced callers to match on the message text.
 */
export type EnterpriseAuditAccessResult =
  | { success: true; context: EnterpriseAuditContext }
  | { success: false; status: 403; code: ForbiddenDetailCode; message: string }

/** Resolves transport-neutral enterprise audit-log access for an organization administrator. */
export async function resolveEnterpriseAuditAccess(
  userId: string,
  targetOrganizationId?: string
): Promise<EnterpriseAuditAccessResult> {
  const [membership] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(
      targetOrganizationId
        ? and(eq(member.userId, userId), eq(member.organizationId, targetOrganizationId))
        : eq(member.userId, userId)
    )
    .limit(1)

  if (!membership) {
    return {
      success: false,
      status: 403,
      code: 'ORGANIZATION_MEMBERSHIP_REQUIRED',
      message: targetOrganizationId
        ? 'Not a member of the requested organization'
        : 'Not a member of any organization',
    }
  }

  if (membership.role !== 'admin' && membership.role !== 'owner') {
    return {
      success: false,
      status: 403,
      code: 'ORGANIZATION_ADMIN_REQUIRED',
      message: 'Organization admin or owner role required',
    }
  }

  if (!isBillingEnabled && !isAuditLogsEnabled) {
    return {
      success: false,
      status: 403,
      code: 'AUDIT_LOGS_DISABLED',
      message:
        'Audit logs are disabled. Set ENTERPRISE_ENABLED or AUDIT_LOGS_ENABLED to enable them.',
    }
  }

  const orgMembers = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, membership.organizationId))

  const orgMemberIds = orgMembers.map((organizationMember) => organizationMember.userId)
  logger.info('Organization audit access validated', {
    userId,
    organizationId: membership.organizationId,
    memberCount: orgMemberIds.length,
  })

  return {
    success: true,
    context: { organizationId: membership.organizationId, orgMemberIds },
  }
}
