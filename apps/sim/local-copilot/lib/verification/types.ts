export type VerificationStatus = 'verified' | 'unverified' | 'failed'

export type TurnCompletionStatus =
  | 'completed_verified'
  | 'completed_unverified'
  | 'partial'
  | 'failed'

export type SpecialistVerificationState = VerificationStatus | 'not_required'

export interface VerificationRecord {
  id: string
  toolCallId: string
  toolName: string
  verifierToolName: string
  resourceIds: string[]
  status: VerificationStatus
  evidence: unknown
  checkedAt: string
}

export interface MutationOutcome {
  toolName: string
  success: boolean
}

export interface SpecialistStructuredResult {
  summary: string
  affectedResources: Array<{ type: string; id: string }>
  errors: string[]
  verificationState: SpecialistVerificationState
  findings: string
}
