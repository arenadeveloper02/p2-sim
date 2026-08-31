import { z } from 'zod'
import { type ContractJsonResponse, defineRouteContract } from '@/lib/api/contracts/types'
import { adminV1SingleResponseSchema } from '@/lib/api/contracts/v1/admin/shared'

export const adminV1ClientOrgDetailsSchema = z.object({
  clientId: z
    .string({ error: 'clientId is required' })
    .trim()
    .min(1, { error: 'clientId is required' }),
  clientName: z
    .string({ error: 'clientName is required' })
    .trim()
    .min(1, { error: 'clientName is required' }),
  organizationName: z
    .string({ error: 'organizationName is required' })
    .trim()
    .min(1, { error: 'organizationName is required' }),
})

export const adminV1EnsureClientOrganizationMemberBodySchema = z.object({
  userId: z.string({ error: 'userId is required' }).min(1, { error: 'userId is required' }),
  orgDetails: adminV1ClientOrgDetailsSchema,
})

export const adminV1EnsureClientOrganizationMemberResultSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  organizationId: z.string(),
  memberId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  action: z.enum(['organization_created', 'member_added', 'already_member']),
  personalWorkspaceId: z.string().nullable(),
  sharedWorkspaceIds: z.array(z.string()),
  attachedWorkspaceIds: z.array(z.string()),
})

export const adminV1EnsureClientOrganizationMemberContract = defineRouteContract({
  method: 'POST',
  path: '/api/v1/admin/client-organizations/ensure-member',
  body: adminV1EnsureClientOrganizationMemberBodySchema,
  response: {
    mode: 'json',
    schema: adminV1SingleResponseSchema(adminV1EnsureClientOrganizationMemberResultSchema),
  },
})

export type AdminV1EnsureClientOrganizationMemberBody = z.input<
  typeof adminV1EnsureClientOrganizationMemberBodySchema
>
export type AdminV1EnsureClientOrganizationMemberResult = z.output<
  typeof adminV1EnsureClientOrganizationMemberResultSchema
>
export type AdminV1EnsureClientOrganizationMemberResponse = ContractJsonResponse<
  typeof adminV1EnsureClientOrganizationMemberContract
>
