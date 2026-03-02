'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useOAuthCredentialDetail, useOAuthCredentials } from '@/hooks/queries/oauth-credentials'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

/**
 * Returns whether the given OAuth credential is "foreign" (from another workspace
 * or shared), i.e. not in the current workspace's credential list.
 */
export function useForeignCredential(
  providerId: string,
  credentialId: string
): { isForeignCredential: boolean } {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) ?? ''
  const activeWorkflowId = useWorkflowRegistry((s) => s.activeWorkflowId)
  const workflowId = (params?.workflowId as string) ?? activeWorkflowId ?? ''

  const { data: workspaceCredentials = [] } = useOAuthCredentials(providerId || undefined, {
    workspaceId,
    workflowId,
    enabled: Boolean(providerId),
  })

  const isInWorkspaceList = useMemo(
    () => workspaceCredentials.some((c) => c.id === credentialId),
    [workspaceCredentials, credentialId]
  )

  const shouldFetchDetail = Boolean(credentialId && !isInWorkspaceList && providerId && workflowId)

  const { data: detailCredentials = [] } = useOAuthCredentialDetail(
    shouldFetchDetail ? credentialId : undefined,
    workflowId,
    shouldFetchDetail
  )

  const isForeignCredential =
    Boolean(credentialId) && !isInWorkspaceList && detailCredentials.length > 0

  return { isForeignCredential }
}
