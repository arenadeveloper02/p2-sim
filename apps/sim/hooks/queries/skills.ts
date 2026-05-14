import { createLogger } from '@sim/logger'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const logger = createLogger('SkillsQueries')
const API_ENDPOINT = '/api/skills'

export interface SkillDefinition {
  id: string
  workspaceId: string | null
  userId: string | null
  name: string
  description: string
  content: string
  sourceUrl?: string | null
  sourceType?: string | null
  rootPath?: string | null
  createdAt: string
  updatedAt?: string
  nodes?: SkillNodeDefinition[]
  nodeCount?: number
}

export interface SkillNodeDefinition {
  id: string
  skillId: string
  parentId: string | null
  path: string
  type: 'folder' | 'skill' | 'file'
  name: string
  description: string | null
  allowedTools?: string[] | null
  sortOrder: number
}

export interface SkillImportPreview {
  name: string
  description: string
  content: string
  sourceUrl: string
  sourceType: 'github'
  rootPath: string
  nodes: Array<{
    path: string
    type: 'folder' | 'skill' | 'file'
    name: string
    description?: string | null
    content?: string | null
    allowedTools?: string[] | null
    sortOrder?: number
  }>
  fileCount: number
  skillCount: number
  totalBytes: number
}

/**
 * Query key factories for skills queries
 */
export const skillsKeys = {
  all: ['skills'] as const,
  lists: () => [...skillsKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...skillsKeys.lists(), workspaceId] as const,
}

/**
 * Fetch skills for a workspace
 */
async function fetchSkills(workspaceId: string, signal?: AbortSignal): Promise<SkillDefinition[]> {
  const response = await fetch(`${API_ENDPOINT}?workspaceId=${workspaceId}`, { signal })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to fetch skills: ${response.statusText}`)
  }

  const { data } = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid response format')
  }

  return data.map((s: Record<string, unknown>) => ({
    id: s.id as string,
    workspaceId: (s.workspaceId as string) ?? null,
    userId: (s.userId as string) ?? null,
    name: s.name as string,
    description: s.description as string,
    content: s.content as string,
    sourceUrl: (s.sourceUrl as string | null | undefined) ?? null,
    sourceType: (s.sourceType as string | null | undefined) ?? null,
    rootPath: (s.rootPath as string | null | undefined) ?? null,
    createdAt: (s.createdAt as string) ?? new Date().toISOString(),
    updatedAt: s.updatedAt as string | undefined,
    nodes: Array.isArray(s.nodes)
      ? s.nodes.map((node: Record<string, unknown>) => ({
          id: node.id as string,
          skillId: node.skillId as string,
          parentId: (node.parentId as string | null | undefined) ?? null,
          path: node.path as string,
          type: node.type as 'folder' | 'skill' | 'file',
          name: node.name as string,
          description: (node.description as string | null | undefined) ?? null,
          allowedTools: (node.allowedTools as string[] | null | undefined) ?? null,
          sortOrder: (node.sortOrder as number | undefined) ?? 0,
        }))
      : [],
    nodeCount: (s.nodeCount as number | undefined) ?? 0,
  }))
}

/**
 * Hook to fetch skills for a workspace
 */
export function useSkills(workspaceId: string) {
  return useQuery<SkillDefinition[]>({
    queryKey: skillsKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchSkills(workspaceId, signal),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/**
 * Create skill mutation
 */
interface CreateSkillParams {
  workspaceId: string
  skill: {
    name: string
    description: string
    content: string
  }
}

export function useCreateSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workspaceId, skill: s }: CreateSkillParams) => {
      logger.info(`Creating skill: ${s.name} in workspace ${workspaceId}`)

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: [{ name: s.name, description: s.description, content: s.content }],
          workspaceId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create skill')
      }

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid API response: missing skills data')
      }

      logger.info(`Created skill: ${s.name}`)
      return data.data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: skillsKeys.list(variables.workspaceId) })
    },
  })
}

/**
 * Update skill mutation
 */
interface UpdateSkillParams {
  workspaceId: string
  skillId: string
  updates: {
    name?: string
    description?: string
    content?: string
  }
}

export function useUpdateSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workspaceId, skillId, updates }: UpdateSkillParams) => {
      logger.info(`Updating skill: ${skillId} in workspace ${workspaceId}`)

      const currentSkills = queryClient.getQueryData<SkillDefinition[]>(
        skillsKeys.list(workspaceId)
      )
      const currentSkill = currentSkills?.find((s) => s.id === skillId)

      if (!currentSkill) {
        throw new Error('Skill not found')
      }

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: [
            {
              id: skillId,
              name: updates.name ?? currentSkill.name,
              description: updates.description ?? currentSkill.description,
              content: updates.content ?? currentSkill.content,
            },
          ],
          workspaceId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update skill')
      }

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid API response: missing skills data')
      }

      logger.info(`Updated skill: ${skillId}`)
      return data.data
    },
    onMutate: async ({ workspaceId, skillId, updates }) => {
      await queryClient.cancelQueries({ queryKey: skillsKeys.list(workspaceId) })

      const previousSkills = queryClient.getQueryData<SkillDefinition[]>(
        skillsKeys.list(workspaceId)
      )

      if (previousSkills) {
        queryClient.setQueryData<SkillDefinition[]>(
          skillsKeys.list(workspaceId),
          previousSkills.map((s) =>
            s.id === skillId
              ? {
                  ...s,
                  name: updates.name ?? s.name,
                  description: updates.description ?? s.description,
                  content: updates.content ?? s.content,
                }
              : s
          )
        )
      }

      return { previousSkills }
    },
    onError: (_err, variables, context) => {
      if (context?.previousSkills) {
        queryClient.setQueryData(skillsKeys.list(variables.workspaceId), context.previousSkills)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: skillsKeys.list(variables.workspaceId) })
    },
  })
}

/**
 * Delete skill mutation
 */
interface DeleteSkillParams {
  workspaceId: string
  skillId: string
}

export function useDeleteSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workspaceId, skillId }: DeleteSkillParams) => {
      logger.info(`Deleting skill: ${skillId}`)

      const response = await fetch(`${API_ENDPOINT}?id=${skillId}&workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete skill')
      }

      logger.info(`Deleted skill: ${skillId}`)
      return data
    },
    onMutate: async ({ workspaceId, skillId }) => {
      await queryClient.cancelQueries({ queryKey: skillsKeys.list(workspaceId) })

      const previousSkills = queryClient.getQueryData<SkillDefinition[]>(
        skillsKeys.list(workspaceId)
      )

      if (previousSkills) {
        queryClient.setQueryData<SkillDefinition[]>(
          skillsKeys.list(workspaceId),
          previousSkills.filter((s) => s.id !== skillId)
        )
      }

      return { previousSkills }
    },
    onError: (_err, variables, context) => {
      if (context?.previousSkills) {
        queryClient.setQueryData(skillsKeys.list(variables.workspaceId), context.previousSkills)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: skillsKeys.list(variables.workspaceId) })
    },
  })
}

export function usePreviewSkillImport() {
  return useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      const response = await fetch(`${API_ENDPOINT}/import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview skill import')
      }

      return data.preview as SkillImportPreview
    },
  })
}

export function useImportSkillPack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workspaceId, url }: { workspaceId: string; url: string }) => {
      const response = await fetch(`${API_ENDPOINT}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, url }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import skill pack')
      }

      return data.data as SkillDefinition
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: skillsKeys.list(variables.workspaceId) })
    },
  })
}
