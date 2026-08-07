/**
 * Coarse Local Copilot UX phases for live status.
 */
export const LOCAL_UX_PHASES = [
  'proposing',
  'executing',
  'waiting_approval',
  'verifying',
] as const

export type LocalUxPhase = (typeof LOCAL_UX_PHASES)[number]

const PHASE_LABELS: Record<LocalUxPhase, string> = {
  proposing: 'Proposing…',
  executing: 'Executing…',
  waiting_approval: 'Waiting for approval…',
  verifying: 'Verifying…',
}

/**
 * Returns the user-facing status label for a UX phase.
 */
export function formatUxPhaseStatus(phase: LocalUxPhase): string {
  return PHASE_LABELS[phase]
}

/**
 * Type guard for LocalUxPhase.
 */
export function isLocalUxPhase(value: unknown): value is LocalUxPhase {
  return typeof value === 'string' && (LOCAL_UX_PHASES as readonly string[]).includes(value)
}
