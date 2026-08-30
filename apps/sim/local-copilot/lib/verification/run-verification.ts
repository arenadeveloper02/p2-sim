import { generateId } from '@sim/utils/id'
import { getVerifierForMutation } from '@/local-copilot/lib/verification/policy'
import type { VerificationRecord, VerificationStatus } from '@/local-copilot/lib/verification/types'

interface ToolExecutionLike {
  toolName?: string
  success: boolean
  result?: unknown
  error?: string
}

export interface RunPostMutationVerificationParams {
  toolCallId: string
  toolName: string
  mutationSuccess: boolean
  mutationResult: unknown
  workflowId?: string
  executeVerifier: (toolName: string, args: Record<string, unknown>) => Promise<ToolExecutionLike>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function resolveWorkflowId(mutationResult: unknown, workflowId?: string): string | undefined {
  if (workflowId?.trim()) return workflowId.trim()
  const record = asRecord(mutationResult)
  for (const key of ['workflowId', 'createdWorkflowId', 'id']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function interpretValidateWorkflow(result: ToolExecutionLike): VerificationStatus {
  if (!result.success) return 'failed'
  const payload = asRecord(result.result)
  if (payload.valid === false) return 'failed'
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return 'failed'
  if (typeof payload.workflowLintMessage === 'string' && payload.workflowLintMessage.trim()) {
    return 'failed'
  }
  return 'verified'
}

function interpretDeploymentStatus(result: ToolExecutionLike): VerificationStatus {
  if (!result.success) return 'failed'
  const payload = asRecord(result.result)
  if (payload.isDeployed === true || payload.deployed === true || payload.status === 'live') {
    return 'verified'
  }
  if (
    payload.isDeployed === false ||
    payload.deployed === false ||
    payload.status === 'failed' ||
    payload.status === 'error'
  ) {
    return 'failed'
  }
  // Successful status read without a clear deployed flag still counts as evidence collected.
  return Object.keys(payload).length > 0 ? 'verified' : 'unverified'
}

function interpretVerifierResult(
  verifierToolName: string,
  result: ToolExecutionLike
): VerificationStatus {
  if (verifierToolName === 'validate_workflow') return interpretValidateWorkflow(result)
  if (verifierToolName === 'check_deployment_status') return interpretDeploymentStatus(result)
  return result.success ? 'verified' : 'failed'
}

/**
 * Runs the app-owned verifier for a successful mutation and returns a record.
 */
export async function runPostMutationVerification(
  params: RunPostMutationVerificationParams
): Promise<VerificationRecord | null> {
  if (!params.mutationSuccess) return null

  const verifierToolName = getVerifierForMutation(params.toolName)
  if (!verifierToolName) return null

  const resourceWorkflowId = resolveWorkflowId(params.mutationResult, params.workflowId)
  const checkedAt = new Date().toISOString()
  const base = {
    id: generateId(),
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    verifierToolName,
    resourceIds: resourceWorkflowId ? [resourceWorkflowId] : [],
    checkedAt,
  }

  if (!resourceWorkflowId) {
    return {
      ...base,
      status: 'unverified',
      evidence: { reason: 'missing_workflow_id' },
    }
  }

  try {
    const verifierResult = await params.executeVerifier(verifierToolName, {
      workflowId: resourceWorkflowId,
    })
    return {
      ...base,
      status: interpretVerifierResult(verifierToolName, verifierResult),
      evidence: {
        success: verifierResult.success,
        result: verifierResult.result ?? null,
        ...(verifierResult.error ? { error: verifierResult.error } : {}),
      },
    }
  } catch (error) {
    return {
      ...base,
      status: 'unverified',
      evidence: {
        reason: 'verifier_threw',
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
