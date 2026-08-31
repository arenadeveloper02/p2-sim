import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  createSkillServiceContract,
  deleteSkillServiceContract,
  getSkillSharePresenceContract,
  listSkillServicesContract,
  listSkillShareCatalogContract,
  listSkillShareSourceSkillsContract,
  type PublishSkillShareBody,
  publishSkillShareContract,
  type ShareSkillShareBody,
  type SkillShareCatalogEntry,
  type SkillShareSourceSkill,
  type SkillShareWorkspace,
  searchSkillShareWorkspacesContract,
  shareSkillShareContract,
  unpublishSkillShareContract,
  updateSkillServiceContract,
} from '@/lib/api/contracts/skill-share'

export const SKILL_SHARE_STALE_TIME = 30 * 1000

export const skillShareKeys = {
  all: ['skillShare'] as const,
  services: () => [...skillShareKeys.all, 'services'] as const,
  catalogs: () => [...skillShareKeys.all, 'catalog'] as const,
  sourceSkills: () => [...skillShareKeys.all, 'sourceSkills'] as const,
  sourceSkillList: (workspaceId: string) =>
    [...skillShareKeys.sourceSkills(), workspaceId] as const,
  workspaces: () => [...skillShareKeys.all, 'workspaces'] as const,
  workspaceSearch: (search: string) => [...skillShareKeys.workspaces(), search] as const,
  presence: () => [...skillShareKeys.all, 'presence'] as const,
  presenceDetail: (catalogId: string) => [...skillShareKeys.presence(), catalogId] as const,
}

export function useSkillServices() {
  return useQuery({
    queryKey: skillShareKeys.services(),
    queryFn: ({ signal }) =>
      requestJson(listSkillServicesContract, { signal }).then((data) => data.services),
    staleTime: SKILL_SHARE_STALE_TIME,
  })
}

export function useCreateSkillService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => requestJson(createSkillServiceContract, { body: { name } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: skillShareKeys.services() }),
  })
}

export function useUpdateSkillService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      requestJson(updateSkillServiceContract, { params: { id }, body: { name } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: skillShareKeys.services() })
      queryClient.invalidateQueries({ queryKey: skillShareKeys.catalogs() })
    },
  })
}

export function useDeleteSkillService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requestJson(deleteSkillServiceContract, { params: { id } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: skillShareKeys.services() })
      queryClient.invalidateQueries({ queryKey: skillShareKeys.catalogs() })
    },
  })
}

export function useSkillShareCatalog() {
  return useQuery({
    queryKey: skillShareKeys.catalogs(),
    queryFn: ({ signal }) =>
      requestJson(listSkillShareCatalogContract, { signal }).then((data) => data.catalog),
    staleTime: SKILL_SHARE_STALE_TIME,
  })
}

export function usePublishSkillShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PublishSkillShareBody) => requestJson(publishSkillShareContract, { body }),
    onSuccess: (data) => {
      queryClient.setQueryData<SkillShareCatalogEntry[]>(skillShareKeys.catalogs(), (current) => {
        const existing = current ?? []
        if (existing.some((row) => row.id === data.entry.id)) return existing
        return [...existing, data.entry]
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: skillShareKeys.catalogs() })
      void queryClient.invalidateQueries({ queryKey: skillShareKeys.sourceSkills() })
    },
  })
}

export function useUnpublishSkillShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requestJson(unpublishSkillShareContract, { params: { id } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: skillShareKeys.catalogs() })
      queryClient.invalidateQueries({ queryKey: skillShareKeys.sourceSkills() })
      queryClient.invalidateQueries({ queryKey: skillShareKeys.presence() })
    },
  })
}

export function useSkillShareSourceSkills(workspaceId: string) {
  return useQuery({
    queryKey: skillShareKeys.sourceSkillList(workspaceId),
    queryFn: async ({ signal }): Promise<SkillShareSourceSkill[]> => {
      const data = await requestJson(listSkillShareSourceSkillsContract, {
        query: { workspaceId },
        signal,
      })
      return data.skills
    },
    enabled: workspaceId.length > 0,
    staleTime: SKILL_SHARE_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useSkillShareWorkspaceSearch(search: string, enabled = true) {
  return useQuery({
    queryKey: skillShareKeys.workspaceSearch(search),
    queryFn: async ({ signal }): Promise<SkillShareWorkspace[]> => {
      const data = await requestJson(searchSkillShareWorkspacesContract, {
        query: { search },
        signal,
      })
      return data.workspaces
    },
    enabled,
    staleTime: SKILL_SHARE_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useSkillSharePresence(catalogId: string) {
  return useQuery({
    queryKey: skillShareKeys.presenceDetail(catalogId),
    queryFn: ({ signal }) =>
      requestJson(getSkillSharePresenceContract, {
        params: { id: catalogId },
        query: { workspaceIds: '' },
        signal,
      }),
    enabled: catalogId.length > 0,
    staleTime: SKILL_SHARE_STALE_TIME,
  })
}

export function useShareSkillCatalog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ShareSkillShareBody) => requestJson(shareSkillShareContract, { body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: skillShareKeys.catalogs() })
      void queryClient.invalidateQueries({ queryKey: skillShareKeys.presence() })
    },
  })
}
