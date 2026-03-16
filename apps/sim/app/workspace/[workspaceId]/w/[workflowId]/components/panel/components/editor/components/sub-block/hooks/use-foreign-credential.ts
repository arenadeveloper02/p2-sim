'use client'

import { useParams } from 'next/navigation'
import { useOAuthCredentialDetail, useOAuthCredentials } from '@/hooks/queries/oauth-credentials'

/**
 * Returns whether the given credential ID is "foreign" to the current workspace
 * (i.e. not in the workspace's credential list but resolvable by ID, e.g. from another workspace).
 */
export function useForeignCredential(
  providerId: string,
  credentialId: string
): { isForeignCredential: boolean } {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''
  const workflowId = (params?.workflowId as string) || ''

  const { data: credentials = [] } = useOAuthCredentials(providerId, {
    enabled: Boolean(providerId) && Boolean(credentialId),
    workspaceId,
    workflowId,
  })

  const selectedInList = credentials.some((cred) => cred.id === credentialId)
  const shouldFetchDetail =
    Boolean(credentialId) && !selectedInList && Boolean(providerId) && Boolean(workflowId)

  const { data: foreignCredentials = [] } = useOAuthCredentialDetail(
    shouldFetchDetail ? credentialId : undefined,
    workflowId,
    shouldFetchDetail
  )

  const isForeignCredential = !credentialId
    ? false
    : selectedInList
      ? false
      : foreignCredentials.length > 0

  return { isForeignCredential }
}
