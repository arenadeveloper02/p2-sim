import {
  getVerifierForMutation,
  mutationRequiresVerification,
} from '@/local-copilot/lib/verification/policy'
import type {
  MutationOutcome,
  TurnCompletionStatus,
  VerificationRecord,
} from '@/local-copilot/lib/verification/types'

interface ResolveTurnCompletionParams {
  mutationOutcomes: MutationOutcome[]
  verifications: VerificationRecord[]
}

/**
 * Rolls mutation and verification outcomes into a turn-level completion label.
 */
export function resolveTurnCompletion(
  params: ResolveTurnCompletionParams
): TurnCompletionStatus {
  const requiredMutations = params.mutationOutcomes.filter((outcome) =>
    mutationRequiresVerification(outcome.toolName)
  )
  const successfulRequired = requiredMutations.filter((outcome) => outcome.success)
  const failedMutations = params.mutationOutcomes.filter((outcome) => !outcome.success)
  const hasFailedVerification = params.verifications.some((record) => record.status === 'failed')
  const hasUnverified = params.verifications.some((record) => record.status === 'unverified')
  const allVerified =
    successfulRequired.length > 0 &&
    successfulRequired.every((outcome) => {
      const verifier = getVerifierForMutation(outcome.toolName)
      if (!verifier) return true
      return params.verifications.some(
        (record) =>
          record.toolName === outcome.toolName &&
          record.verifierToolName === verifier &&
          record.status === 'verified'
      )
    })

  if (requiredMutations.length === 0) {
    if (failedMutations.length > 0 && params.mutationOutcomes.every((o) => !o.success)) {
      return 'failed'
    }
    if (failedMutations.length > 0) return 'partial'
    return 'completed_verified'
  }

  if (successfulRequired.length === 0) {
    return 'failed'
  }

  if (hasFailedVerification && !allVerified) {
    if (failedMutations.length > 0 || successfulRequired.length < requiredMutations.length) {
      return 'partial'
    }
    return 'failed'
  }

  if (failedMutations.length > 0 || successfulRequired.length < requiredMutations.length) {
    return 'partial'
  }

  if (hasFailedVerification) return 'partial'
  if (hasUnverified || !allVerified) return 'completed_unverified'
  return 'completed_verified'
}
