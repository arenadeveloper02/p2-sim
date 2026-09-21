import { createLogger } from '@sim/logger'
import type { DurableSecretProvenanceSurface } from '@/lib/execution/durable-secret-provenance-telemetry'

const logger = createLogger('DurableSecretProvenanceEnforcement')

export type UnrecordedDurableProvenanceCause =
  | 'row-sidecar-not-exact'
  | 'durable-provenance-unknown'

export interface UnrecordedDurableProvenanceReport {
  surface: DurableSecretProvenanceSurface
  cause: UnrecordedDurableProvenanceCause
}

/**
 * Knowledge stays under-redact until a hosted enforcement flag exists: incomplete
 * sidecars are reported and omitted rather than latching `complete: false` onto
 * the executor display registry.
 */
export function isDurableSecretProvenanceEnforced(
  _surface: DurableSecretProvenanceSurface
): boolean {
  return false
}

/** Reports a skipped incomplete sidecar when enforcement is off. */
export function reportUnrecordedDurableProvenance(report: UnrecordedDurableProvenanceReport): void {
  logger.warn('Unrecorded durable secret provenance', {
    surface: report.surface,
    cause: report.cause,
  })
}
