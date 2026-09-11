import { env, isTruthy } from '@/lib/core/config/env'
import { isBillingEnabled } from '@/lib/core/config/env-flags'

/**
 * True when Arena-specific billing (Starter plan, flat org pricing, etc.) is active.
 * Defaults to on whenever billing is enabled so the Arena fork works without extra env.
 */
export function isArenaBilling(): boolean {
  if (!isBillingEnabled) return false
  if (env.ARENA_BILLING_ENABLED !== undefined) {
    return isTruthy(env.ARENA_BILLING_ENABLED)
  }
  return true
}
