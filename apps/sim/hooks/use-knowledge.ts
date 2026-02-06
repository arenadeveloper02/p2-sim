import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { knowledgeKeys, useUserAccessKnowledgeBasesQuery } from '@/hooks/queries/knowledge'

/**
 * Hook to fetch knowledge bases that user has access to via workspace permissions
 * Uses React Query as single source of truth
 */
export function useUserAccessKnowledgeBases(
  workspaceId?: string,
  options?: {
    enabled?: boolean
  }
) {
  const queryClient = useQueryClient()
  const query = useUserAccessKnowledgeBasesQuery(workspaceId, {
    enabled: options?.enabled ?? true,
  })

  const refreshList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: knowledgeKeys.userAccess(workspaceId) })
  }, [queryClient, workspaceId])

  return {
    knowledgeBases: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refreshList,
  }
}
