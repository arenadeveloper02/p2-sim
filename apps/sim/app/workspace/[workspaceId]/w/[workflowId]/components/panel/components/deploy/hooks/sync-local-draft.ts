import { isEqual } from 'es-toolkit'
import { requestJson } from '@/lib/api/client/request'
import { getWorkflowStateContract } from '@/lib/api/contracts'
import { useOperationQueueStore } from '@/stores/operation-queue/store'
import { useWorkflowDiffStore } from '@/stores/workflow-diff/store'
import {
  applyWorkflowStateToStores,
  persistWorkflowStateToServer,
} from '@/stores/workflow-diff/utils'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { mergeSubblockState } from '@/stores/workflows/utils'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'
import type { WorkflowState } from '@/stores/workflows/workflow/types'

function canApplyServerSnapshot(
  workflowId: string,
  remoteVersionAtStart: number,
  localOperationVersionAtStart: number
): boolean {
  if (useWorkflowRegistry.getState().activeWorkflowId !== workflowId) return false
  const operationQueueState = useOperationQueueStore.getState()
  if (operationQueueState.hasPendingOperations(workflowId)) return false
  if (
    (operationQueueState.workflowOperationVersions[workflowId] ?? 0) !==
    localOperationVersionAtStart
  ) {
    return false
  }

  const diffState = useWorkflowDiffStore.getState()
  return (
    !diffState.hasActiveDiff &&
    !diffState.pendingExternalUpdates[workflowId] &&
    !diffState.reconcilingWorkflows[workflowId] &&
    !diffState.reconciliationErrors[workflowId] &&
    (diffState.remoteUpdateVersions[workflowId] ?? 0) === remoteVersionAtStart
  )
}

/**
 * Persists any subblock values that exist only in the subblock store into the
 * normalized draft tables before deployment. Deploy snapshots and post-deploy
 * draft sync both read from the database, so editor-only subblock store drift
 * would otherwise clear fields such as image generator provider/model.
 */
export async function flushMergedLocalDraftToServer(workflowId: string): Promise<boolean> {
  if (useWorkflowRegistry.getState().activeWorkflowId !== workflowId) return false

  const workflowStore = useWorkflowStore.getState()
  const currentState = workflowStore.getWorkflowState()
  const mergedBlocks = mergeSubblockState(currentState.blocks, workflowId)

  if (isEqual(currentState.blocks, mergedBlocks)) {
    return true
  }

  const mergedState: WorkflowState = {
    ...currentState,
    blocks: mergedBlocks,
  }

  workflowStore.replaceWorkflowState(mergedState)
  return persistWorkflowStateToServer(workflowId, mergedState)
}

export async function syncLocalDraftFromServer(workflowId: string): Promise<boolean> {
  if (useWorkflowRegistry.getState().activeWorkflowId !== workflowId) return false
  if (useOperationQueueStore.getState().hasPendingOperations(workflowId)) return false
  const localOperationVersionAtStart =
    useOperationQueueStore.getState().workflowOperationVersions[workflowId] ?? 0
  const remoteVersionAtStart = useWorkflowDiffStore.getState().remoteUpdateVersions[workflowId] ?? 0

  const responseData = await requestJson(getWorkflowStateContract, {
    params: { id: workflowId },
  })
  const wireState = responseData.data?.state
  if (!canApplyServerSnapshot(workflowId, remoteVersionAtStart, localOperationVersionAtStart)) {
    return false
  }
  if (!wireState) {
    throw new Error('No workflow state was returned while syncing the local draft')
  }

  // double-cast-allowed: workflowStateSchema is a wire supertype; normalized workflow state is persisted in store-compatible shape
  const workflowState = wireState as unknown as WorkflowState
  if (Object.hasOwn(responseData.data, 'variables')) {
    workflowState.variables = responseData.data.variables || {}
  }
  applyWorkflowStateToStores(workflowId, workflowState, { updateLastSaved: true })
  return true
}
