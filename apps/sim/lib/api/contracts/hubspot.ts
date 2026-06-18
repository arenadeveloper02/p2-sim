import { z } from 'zod'
import { workspaceIdSchema } from '@/lib/api/contracts/primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const hubSpotAccountOptionSourceSchema = z.enum(['public', 'personal'])

export const hubSpotAccountOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: hubSpotAccountOptionSourceSchema,
  alias: z.string().min(1).optional(),
  credentialId: z.string().min(1).optional(),
})

export type HubSpotAccountOption = z.output<typeof hubSpotAccountOptionSchema>

export const listHubSpotAccountsQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
})

export type ListHubSpotAccountsQuery = z.input<typeof listHubSpotAccountsQuerySchema>

export const listHubSpotAccountsResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(hubSpotAccountOptionSchema),
  error: z.string().optional(),
})

export type ListHubSpotAccountsResponse = z.output<typeof listHubSpotAccountsResponseSchema>

export const listHubSpotAccountsContract = defineRouteContract({
  method: 'GET',
  path: '/api/hubspot/accounts',
  query: listHubSpotAccountsQuerySchema,
  response: {
    mode: 'json',
    schema: listHubSpotAccountsResponseSchema,
  },
})
