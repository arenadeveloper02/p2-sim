/**
 * Spend-cap helpers for Local Copilot turns.
 * Reuses hosted usage limits (`checkServerSideUsageLimits`) rather than a new budget table.
 */

export interface SpendCapSnapshot {
  isExceeded: boolean
  currentUsage: number
  limit: number
  message?: string
}

export interface SpendCapDecision {
  ok: boolean
  remaining: number
  error?: string
}

/**
 * Remaining USD budget after current period usage and this turn's spend so far.
 */
export function remainingSpendBudget(params: {
  limit: number
  currentUsage: number
  turnSoFar: number
}): number {
  return Math.max(0, params.limit - params.currentUsage - Math.max(0, params.turnSoFar))
}

/**
 * Fail-closed gate for starting or continuing a Local Copilot turn.
 */
export function assertSpendCapAllows(params: {
  isExceeded: boolean
  currentUsage: number
  limit: number
  turnSoFar?: number
  message?: string
}): SpendCapDecision {
  const turnSoFar = params.turnSoFar ?? 0
  if (params.isExceeded) {
    return {
      ok: false,
      remaining: 0,
      error: params.message ?? 'Usage limit exceeded for this billing period.',
    }
  }

  const remaining = remainingSpendBudget({
    limit: params.limit,
    currentUsage: params.currentUsage,
    turnSoFar,
  })

  if (remaining <= 0) {
    return {
      ok: false,
      remaining: 0,
      error:
        params.message ??
        'Arena Copilot spend cap reached for this billing period. Upgrade or wait for the next cycle.',
    }
  }

  return { ok: true, remaining }
}
