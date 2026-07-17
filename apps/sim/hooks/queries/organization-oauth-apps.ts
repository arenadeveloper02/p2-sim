import { createLogger } from '@sim/logger'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  deleteOrganizationOAuthAppContract,
  listOrganizationOAuthAppsContract,
  type OrganizationOAuthAppSummary,
  upsertOrganizationOAuthAppContract,
  type UpsertOrganizationOAuthAppBody,
} from '@/lib/api/contracts/organization-oauth-apps'

const logger = createLogger('OrganizationOAuthAppsQueries')

export const ORGANIZATION_OAUTH_APPS_STALE_TIME = 60 * 1000

export const organizationOAuthAppsKeys = {
  all: ['organization-oauth-apps'] as const,
  lists: () => [...organizationOAuthAppsKeys.all, 'list'] as const,
  list: (organizationId?: string) =>
    [...organizationOAuthAppsKeys.lists(), organizationId ?? ''] as const,
}

async function fetchOrganizationOAuthApps(
  organizationId: string,
  signal?: AbortSignal
): Promise<OrganizationOAuthAppSummary[]> {
  const data = await requestJson(listOrganizationOAuthAppsContract, {
    params: { id: organizationId },
    signal,
  })
  return data.apps
}

export function useOrganizationOAuthApps(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: organizationOAuthAppsKeys.list(organizationId),
    queryFn: ({ signal }) => fetchOrganizationOAuthApps(organizationId as string, signal),
    enabled: Boolean(organizationId) && enabled,
    staleTime: ORGANIZATION_OAUTH_APPS_STALE_TIME,
  })
}

export function useUpsertOrganizationOAuthApp(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: UpsertOrganizationOAuthAppBody) => {
      return requestJson(upsertOrganizationOAuthAppContract, {
        params: { id: organizationId },
        body,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: organizationOAuthAppsKeys.list(organizationId) })
    },
    onError: (error) => {
      logger.error('Failed to save organization OAuth app', { organizationId, error })
    },
  })
}

export function useDeleteOrganizationOAuthApp(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (appKey: string) => {
      return requestJson(deleteOrganizationOAuthAppContract, {
        params: { id: organizationId, providerId: appKey },
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: organizationOAuthAppsKeys.list(organizationId) })
    },
    onError: (error) => {
      logger.error('Failed to delete organization OAuth app', { organizationId, error })
    },
  })
}
