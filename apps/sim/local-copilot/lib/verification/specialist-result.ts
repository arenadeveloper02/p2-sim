import { resolveTurnCompletion } from '@/local-copilot/lib/verification/completion'
import { mutationRequiresVerification } from '@/local-copilot/lib/verification/policy'
import type {
  MutationOutcome,
  SpecialistStructuredResult,
  SpecialistVerificationState,
  VerificationRecord,
} from '@/local-copilot/lib/verification/types'

const STATE_RANK: Record<SpecialistVerificationState, number> = {
  failed: 3,
  unverified: 2,
  verified: 1,
  not_required: 0,
}

/**
 * Builds the structured specialist return contract from loop evidence.
 */
export function buildSpecialistStructuredResult(params: {
  summaryFindings: string
  mutationOutcomes: MutationOutcome[]
  verifications: VerificationRecord[]
  errors: string[]
}): SpecialistStructuredResult {
  const required = params.mutationOutcomes.filter((outcome) =>
    mutationRequiresVerification(outcome.toolName)
  )
  const summary = params.summaryFindings.trim() || 'Specialist completed.'
  const affectedResources = params.verifications
    .flatMap((record) => record.resourceIds.map((id) => ({ type: 'workflow', id })))
    .filter(
      (resource, index, all) =>
        all.findIndex((item) => item.type === resource.type && item.id === resource.id) === index
    )

  if (required.length === 0) {
    return {
      summary,
      affectedResources,
      errors: params.errors,
      verificationState: 'not_required',
      findings: summary,
    }
  }

  const completion = resolveTurnCompletion({
    mutationOutcomes: params.mutationOutcomes,
    verifications: params.verifications,
  })

  const verificationState: SpecialistVerificationState =
    completion === 'completed_verified'
      ? 'verified'
      : completion === 'failed'
        ? 'failed'
        : completion === 'completed_unverified'
          ? 'unverified'
          : params.verifications.some((record) => record.status === 'failed')
            ? 'failed'
            : 'unverified'

  return {
    summary,
    affectedResources,
    errors: params.errors,
    verificationState,
    findings: summary,
  }
}

/**
 * Worst-state aggregation across parallel specialists.
 */
export function aggregateSpecialistVerificationState(
  states: SpecialistVerificationState[]
): SpecialistVerificationState {
  if (states.length === 0) return 'not_required'
  return states.reduce((worst, state) => (STATE_RANK[state] > STATE_RANK[worst] ? state : worst))
}
