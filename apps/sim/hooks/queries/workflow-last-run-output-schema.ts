import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getLastSuccessfulWorkflowOutputSchemaContract,
  type LastSuccessfulWorkflowOutputSchema,
} from '@/lib/api/contracts/workflows'
import { workflowKeys } from '@/hooks/queries/utils/workflow-keys'

export const LAST_SUCCESSFUL_OUTPUT_SCHEMA_STALE_TIME = 30 * 1000

async function fetchLastSuccessfulWorkflowOutputSchema(
  workflowId: string,
  signal?: AbortSignal
): Promise<LastSuccessfulWorkflowOutputSchema> {
  return requestJson(getLastSuccessfulWorkflowOutputSchemaContract, {
    params: { id: workflowId },
    signal,
  })
}

export function useLastSuccessfulWorkflowOutputSchema(
  workflowId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: workflowKeys.lastSuccessfulOutputSchema(workflowId),
    queryFn: ({ signal }) => fetchLastSuccessfulWorkflowOutputSchema(workflowId as string, signal),
    enabled: Boolean(workflowId) && (options?.enabled ?? true),
    staleTime: LAST_SUCCESSFUL_OUTPUT_SCHEMA_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}
