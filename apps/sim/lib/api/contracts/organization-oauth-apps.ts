import { z } from 'zod'
import { organizationParamsSchema } from '@/lib/api/contracts/organization'
import { defineRouteContract } from '@/lib/api/contracts/types'

/** Base provider key stored in `organization_oauth_apps.provider_id` (e.g. `zoom`). */
export const organizationOAuthAppKeySchema = z
  .string()
  .min(1, 'Provider ID is required')
  .max(64, 'Provider ID must be at most 64 characters')

export const organizationOAuthAppParamsSchema = organizationParamsSchema.extend({
  providerId: organizationOAuthAppKeySchema,
})

export const organizationOAuthAppSummarySchema = z.object({
  id: z.string(),
  appKey: z.string(),
  clientId: z.string(),
  hasClientSecret: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const upsertOrganizationOAuthAppBodySchema = z.object({
  appKey: organizationOAuthAppKeySchema,
  clientId: z.string().min(1, 'Client ID is required').max(512, 'Client ID is too long'),
  clientSecret: z
    .string()
    .min(1, 'Client secret is required')
    .max(512, 'Client secret is too long'),
})

export const listOrganizationOAuthAppsContract = defineRouteContract({
  method: 'GET',
  path: '/api/organizations/[id]/oauth-apps',
  params: organizationParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      apps: z.array(organizationOAuthAppSummarySchema),
    }),
  },
})

export const upsertOrganizationOAuthAppContract = defineRouteContract({
  method: 'POST',
  path: '/api/organizations/[id]/oauth-apps',
  params: organizationParamsSchema,
  body: upsertOrganizationOAuthAppBodySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      app: organizationOAuthAppSummarySchema,
    }),
  },
})

export const deleteOrganizationOAuthAppContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/organizations/[id]/oauth-apps/[providerId]',
  params: organizationOAuthAppParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
    }),
  },
})

export type OrganizationOAuthAppSummary = z.output<typeof organizationOAuthAppSummarySchema>
export type UpsertOrganizationOAuthAppBody = z.input<typeof upsertOrganizationOAuthAppBodySchema>
